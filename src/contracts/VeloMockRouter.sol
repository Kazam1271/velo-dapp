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
     */
    function executeMockSwap(
        address tokenA,
        address tokenB,
        uint256 amountAIn
    ) external {
        require(amountAIn > 0, "Swap amount must be greater than zero");

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

    /**
     * @notice Swap native HBAR for an HTS Token B.
     * The caller attaches HBAR to the transaction (msg.value, in tinybars on Hedera EVM).
     * The contract forwards all received HBAR to the treasury and pulls the
     * pre-calculated Token B amount from the treasury's allowance to the caller.
     * @param tokenB     EVM address of the output HTS token.
     * @param amountBOut Pre-calculated output amount in token's smallest unit (done on the frontend).
     */
    function swapHbarForToken(
        address tokenB,
        uint256 amountBOut
    ) external payable {
        require(msg.value > 0, "Must attach HBAR");
        require(amountBOut > 0, "Output amount must be greater than zero");

        // Pull Token B from treasury to the user
        IERC20(tokenB).safeTransferFrom(treasuryWallet, msg.sender, amountBOut);

        // Forward all received HBAR to the treasury wallet
        (bool sent, ) = payable(treasuryWallet).call{value: msg.value}("");
        require(sent, "HBAR forward to treasury failed");

        uint256 feeAmount = (msg.value * feeBasisPoints) / 10000;
        emit SwapExecuted(msg.sender, address(0), tokenB, msg.value, amountBOut, feeAmount);
    }

    /// @notice Allow contract to receive HBAR (required for payable contract calls).
    receive() external payable {}

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
