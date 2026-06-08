// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VeloMockRouter
 * @dev A mock testnet swap contract for the Velo project using an internal inventory route.
 * It accepts Mock Token A, deducts a protocol fee sent to the Velo Treasury, retains the remainder,
 * and sends back a hardcoded ratio of Mock Token B from its own inventory.
 * 
 * Note: Ensure the contract is funded with sufficient Mock Token B before usage.
 */
contract VeloMockRouter is Ownable {
    using SafeERC20 for IERC20;

    // The Velo Treasury Wallet address to receive protocol fees
    address public treasuryWallet;

    // The protocol fee percentage in basis points (e.g., 100 = 1.00%, 50 = 0.50%)
    uint256 public feeBasisPoints;

    // The fixed exchange rate multiplier. 
    // E.g. If rate = 2, then 1 Token A = 2 Token B
    uint256 public exchangeRate;

    // Events for tracking on-chain activities and analytics
    event SwapExecuted(
        address indexed user,
        address indexed tokenA,
        address indexed tokenB,
        uint256 amountAIn,
        uint256 amountBOut,
        uint256 feeDeducted
    );
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event ExchangeRateUpdated(uint256 oldRate, uint256 newRate);

    /**
     * @param _treasuryWallet The initial treasury wallet address.
     * @param _feeBasisPoints The initial fee in basis points (10000 = 100%).
     * @param _exchangeRate The initial exchange rate (amount B per amount A).
     */
    constructor(
        address _treasuryWallet,
        uint256 _feeBasisPoints,
        uint256 _exchangeRate
    ) Ownable(msg.sender) {
        require(_treasuryWallet != address(0), "Treasury cannot be the zero address");
        require(_feeBasisPoints <= 10000, "Fee cannot exceed 100%");
        
        treasuryWallet = _treasuryWallet;
        feeBasisPoints = _feeBasisPoints;
        exchangeRate = _exchangeRate;
    }

    /**
     * @notice Executes a mock swap from Token A to Token B using internal inventory.
     * @param tokenA The EVM address of the input token (Mock Token A).
     * @param tokenB The EVM address of the output token (Mock Token B).
     * @param amountAIn The amount of Token A the user is swapping (in smallest denomination).
     * @dev User MUST attach 0.25 HBAR as a fee, which is stored directly in the smart contract.
     */
    function executeMockSwap(
        address tokenA,
        address tokenB,
        uint256 amountAIn
    ) external payable {
        require(amountAIn > 0, "Swap amount must be greater than zero");

        uint256 hbarFee = 25000000; // 0.25 HBAR (in tinybars)
        require(msg.value == hbarFee, "Must attach exactly 0.25 HBAR fee");

        // 1. Calculate the fee portion
        uint256 feeAmount = (amountAIn * feeBasisPoints) / 10000;
        
        // 2. Transfer Token A from user to this contract
        IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountAIn);

        // 3. Transfer the fee portion directly to the Velo Treasury Wallet
        if (feeAmount > 0) {
            IERC20(tokenA).safeTransfer(treasuryWallet, feeAmount);
        }

        // 4. Calculate the amount of Token B to send back to the user
        uint256 amountBOut = amountAIn * exchangeRate;

        // 5. Transfer Token B from the treasury's inventory directly to the user
        IERC20(tokenB).safeTransferFrom(treasuryWallet, msg.sender, amountBOut);

        emit SwapExecuted(msg.sender, tokenA, tokenB, amountAIn, amountBOut, feeAmount);
    }

    /// @notice Emitted for HBAR -> token swaps. Backend listens to this and sends tokens.
    event HbarSwapRequested(
        address indexed user,
        address indexed tokenOut,
        uint256 hbarAmountIn,
        uint256 expectedTokenOut
    );

    /// @notice Emitted for Token -> HBAR swaps. Backend listens to this and sends HBAR.
    event TokenForHbarSwapRequested(
        address indexed user,
        address indexed tokenIn,
        uint256 amountIn
    );

    /**
     * @notice HBAR -> Token swap entry point.
     * User attaches HBAR; contract keeps 0.25 HBAR fee and transfers principal to treasury.
     */
    function swapHbarForToken(
        address tokenOut,
        uint256 expectedTokenOut
    ) external payable {
        require(msg.value > 0, "Must attach HBAR");
        require(expectedTokenOut > 0, "Expected output must be > 0");

        uint256 fee = 25000000; // 0.25 HBAR (in tinybars)
        require(msg.value > fee, "Amount too small for 0.25 HBAR fee");
        uint256 principal = msg.value - fee;

        // Keep 0.25 HBAR in contract. Send the rest to the treasury wallet.
        (bool sent, ) = payable(treasuryWallet).call{value: principal}("");
        require(sent, "Failed to send principal HBAR to treasury");

        emit HbarSwapRequested(msg.sender, tokenOut, msg.value, expectedTokenOut);
    }

    /**
     * @notice Token -> HBAR swap entry point.
     * User approves contract to spend token; contract pulls token to address(this) then transfers to treasury.
     * User MUST attach 0.25 HBAR as a fee, which is stored directly in the smart contract.
     */
    function swapTokenForHbar(
        address tokenIn,
        uint256 amountIn
    ) external payable {
        require(amountIn > 0, "Must specify amount in");

        uint256 hbarFee = 25000000; // 0.25 HBAR (in tinybars)
        require(msg.value == hbarFee, "Must attach exactly 0.25 HBAR fee");
        
        // 1. Pull Token from user to this contract (works 100% since contract is approved)
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // 2. Transfer Token from this contract to the treasury wallet (standard transfer works 100% on Hedera)
        IERC20(tokenIn).safeTransfer(treasuryWallet, amountIn);

        // Emit event for backend to process payout
        emit TokenForHbarSwapRequested(msg.sender, tokenIn, amountIn);
    }

    /// @notice Allow contract to receive HBAR.
    receive() external payable {}

    /// @notice Sweep accumulated HBAR to the owner wallet.
    function withdrawHbar() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "No HBAR to withdraw");
        (bool sent, ) = payable(owner()).call{value: bal}("");
        require(sent, "HBAR withdrawal failed");
    }

    // --- Admin Configuration Functions ---

    function setTreasuryWallet(address _newTreasury) external onlyOwner {
        require(_newTreasury != address(0), "Invalid treasury address");
        emit TreasuryUpdated(treasuryWallet, _newTreasury);
        treasuryWallet = _newTreasury;
    }

    function setFeeBasisPoints(uint256 _newFeeBP) external onlyOwner {
        require(_newFeeBP <= 10000, "Fee cannot exceed 100%");
        emit FeeUpdated(feeBasisPoints, _newFeeBP);
        feeBasisPoints = _newFeeBP;
    }

    function setExchangeRate(uint256 _newRate) external onlyOwner {
        emit ExchangeRateUpdated(exchangeRate, _newRate);
        exchangeRate = _newRate;
    }

    /**
     * @notice Allows the Velo team to withdraw accidentally sent tokens or retrieve mock inventory.
     * @param token The token address to withdraw.
     * @param amount The amount to withdraw.
     */
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }
}
