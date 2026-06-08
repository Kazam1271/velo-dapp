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
    }

    /**
     * @notice Swap native HBAR for an HTS token.
     * Caller attaches HBAR to the transaction (msg.value in tinybars).
     * The contract forwards HBAR to the treasury and pulls Token B from
     * the treasury's allowance directly to the caller.
     * @param tokenB  EVM address of the output HTS token.
     * @param amountBOut Pre-calculated output amount (computed on frontend using live prices).
     */
    function swapHbarForToken(
        address tokenB,
        uint256 amountBOut
    ) external payable {
        require(msg.value > 0, "Must attach HBAR");
        require(amountBOut > 0, "Output amount must be greater than zero");

        // Pull Token B from treasury to the user
        // Treasury must have pre-approved this contract via AccountAllowanceApproveTransaction
        require(IERC20(tokenB).transferFrom(treasuryWallet, msg.sender, amountBOut), "Treasury payout failed");

        // HBAR stays in the contract balance.
        // The owner (treasury) can withdraw accumulated HBAR via withdrawHbar().
    }

    // Allow contract to receive HBAR
    receive() external payable {}

    /// @notice Withdraw accumulated HBAR from the contract to the owner.
    function withdrawHbar() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "No HBAR to withdraw");
        (bool sent, ) = payable(owner()).call{value: bal}("");
        require(sent, "HBAR withdrawal failed");
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
