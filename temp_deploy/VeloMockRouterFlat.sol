// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

abstract contract Ownable {
    address private _owner;
    constructor(address initialOwner) {
        _owner = initialOwner;
    }
    modifier onlyOwner() {
        require(msg.sender == _owner, "Ownable: caller is not the owner");
        _;
    }
    function owner() public view returns (address) {
        return _owner;
    }
}

contract VeloMockRouter is Ownable {
    address public treasuryWallet;
    uint256 public feeBasisPoints;
    uint256 public exchangeRate;

    /// @notice Emitted for HTS token -> HTS token swaps (on-chain transfer via allowance).
    event SwapExecuted(
        address indexed user,
        address indexed tokenA,
        address indexed tokenB,
        uint256 amountAIn,
        uint256 amountBOut,
        uint256 feeDeducted
    );

    /// @notice Emitted for HBAR -> token swaps. Backend listens to this and sends tokens.
    event HbarSwapRequested(
        address indexed user,
        address indexed tokenOut,
        uint256 hbarAmountIn,
        uint256 expectedTokenOut
    );

    constructor(
        address _treasuryWallet,
        uint256 _feeBasisPoints,
        uint256 _exchangeRate
    ) Ownable(msg.sender) {
        treasuryWallet = _treasuryWallet;
        feeBasisPoints = _feeBasisPoints;
        exchangeRate = _exchangeRate;
    }

    function executeMockSwap(
        address tokenA,
        address tokenB,
        uint256 amountAIn
    ) external {
        require(amountAIn > 0, "Swap amount must be greater than zero");

        uint256 feeAmount = (amountAIn * feeBasisPoints) / 10000;
        
        require(IERC20(tokenA).transferFrom(msg.sender, address(this), amountAIn), "TransferFrom failed");

        if (feeAmount > 0) {
            require(IERC20(tokenA).transfer(treasuryWallet, feeAmount), "Fee transfer failed");
        }

        uint256 amountBOut = amountAIn * exchangeRate;
        require(IERC20(tokenB).transferFrom(treasuryWallet, msg.sender, amountBOut), "Treasury TransferFrom failed");

        emit SwapExecuted(msg.sender, tokenA, tokenB, amountAIn, amountBOut, feeAmount);
    }

    /**
     * @notice HBAR -> Token swap entry point.
     * User attaches HBAR; contract holds it and emits HbarSwapRequested.
     * The Velo backend listens for this event (or verifies via mirror node)
     * and sends the output token to the user from the treasury.
     * This makes the transaction verifiably on-chain as a CONTRACT CALL.
     */
    function swapHbarForToken(
        address tokenOut,
        uint256 expectedTokenOut
    ) external payable {
        require(msg.value > 0, "Must attach HBAR");
        require(expectedTokenOut > 0, "Expected output must be > 0");
        // HBAR is held by the contract. Backend verifies and pays out tokens.
        emit HbarSwapRequested(msg.sender, tokenOut, msg.value, expectedTokenOut);
    }

    /// @notice Emitted for Token -> HBAR swaps. Backend listens to this and sends HBAR.
    event TokenForHbarSwapRequested(
        address indexed user,
        address indexed tokenIn,
        uint256 amountIn
    );

    /**
     * @notice Token -> HBAR swap entry point.
     * User approves contract to spend token; contract pulls token and emits TokenForHbarSwapRequested.
     * The Velo backend listens for this event (or verifies via mirror node)
     * and sends HBAR to the user from the treasury.
     */
    function swapTokenForHbar(
        address tokenIn,
        uint256 amountIn
    ) external {
        require(amountIn > 0, "Must specify amount in");
        
        // Pull Token from user to the contract or treasury. We pull to treasury here for simplicity.
        require(IERC20(tokenIn).transferFrom(msg.sender, treasuryWallet, amountIn), "TransferFrom failed");

        // Emit event for backend to process payout
        emit TokenForHbarSwapRequested(msg.sender, tokenIn, amountIn);
    }

    // Allow contract to receive plain HBAR transfers
    receive() external payable {}

    /// @notice Owner can sweep accumulated HBAR to treasury.
    function withdrawHbar() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "No HBAR to withdraw");
        (bool sent, ) = payable(treasuryWallet).call{value: bal}("");
        require(sent, "Withdrawal failed");
    }

    function setTreasuryWallet(address _newTreasury) external onlyOwner {
        treasuryWallet = _newTreasury;
    }
    function setFeeBasisPoints(uint256 _newFeeBP) external onlyOwner {
        feeBasisPoints = _newFeeBP;
    }
    function setExchangeRate(uint256 _newRate) external onlyOwner {
        exchangeRate = _newRate;
    }
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        require(IERC20(token).transfer(owner(), amount), "Withdraw failed");
    }
}
