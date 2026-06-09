// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VeloMockRouter
 * @notice A mock DEX router for the Velo testnet. Handles three distinct swap routes:
 *
 *   Route A: HBAR → Token
 *     - User attaches native HBAR as msg.value.
 *     - The contract validates the fee, keeps all HBAR internally, and emits an
 *       event that the backend picks up to dispatch the correct token amount.
 *
 *   Route B: Token → HBAR
 *     - The frontend first executes a NATIVE Hedera TransferTransaction to move
 *       the token directly from the user's wallet to the Treasury.
 *       (This bypasses the Hedera EVM / HTS allowance proxy ECDSA-alias bug.)
 *     - The user then calls `payFeeForTokenToHbar` on this contract, attaching
 *       the 0.25 HBAR protocol fee, which is stored directly in the contract.
 *     - The contract emits a TokenForHbarSwapRequested event; the backend reads
 *       both the native token transfer and this contract event, then sends HBAR.
 *
 *   Route C: Token → Token
 *     - Same hybrid approach: native token transfer from user to treasury on-chain,
 *       then a contract call to pay the fee and emit the SwapExecuted event.
 *
 * @dev All HBAR fees accumulate inside the contract and can only be swept by the owner
 *      via withdrawHbar(). This gives the Velo treasury a single auditable fee pot.
 *
 * @dev On Hedera, `msg.value` is in TINYBARS (1 HBAR = 100,000,000 tinybars).
 *      The 0.25 HBAR fixed fee equals 25,000,000 tinybars.
 */
contract VeloMockRouter is Ownable {

    // ─────────────────────────────────────────────────────────────────
    // State Variables
    // ─────────────────────────────────────────────────────────────────

    /// @notice The Velo Treasury Wallet — receives token inventory and sweeps fees.
    address public treasuryWallet;

    /// @notice Protocol fee in basis points (100 = 1%, 10000 = 100%).
    uint256 public feeBasisPoints;

    /// @notice Mock exchange rate: how many units of Token B per 1 unit of Token A.
    uint256 public exchangeRate;

    /// @notice Fixed HBAR fee in TINYBARS that must be attached to all payable calls.
    uint256 public constant PROTOCOL_FEE_TINYBARS = 25_000_000; // 0.25 HBAR

    // ─────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────

    /**
     * @notice Emitted on every successful Route A swap (HBAR → Token).
     * @param user            The user's EVM address.
     * @param tokenOut        The EVM address of the token the user expects to receive.
     * @param hbarAmountIn    The amount of HBAR sent (in TINYBARS, = msg.value).
     * @param expectedTokenOut The pre-calculated token output amount (in token's smallest unit).
     */
    event HbarSwapRequested(
        address indexed user,
        address indexed tokenOut,
        uint256 hbarAmountIn,
        uint256 expectedTokenOut
    );

    /**
     * @notice Emitted on every successful Route B swap (Token → HBAR).
     * @param user      The user's EVM address.
     * @param tokenIn   The EVM address of the token the user sent to the treasury.
     * @param amountIn  The raw token amount sent (in token's smallest unit).
     */
    event TokenForHbarSwapRequested(
        address indexed user,
        address indexed tokenIn,
        uint256 amountIn
    );

    /**
     * @notice Emitted on every successful Route C swap (Token → Token).
     * @param user         The user's EVM address.
     * @param tokenIn      The EVM address of the input token.
     * @param tokenOut     The EVM address of the output token.
     * @param amountIn     The raw input token amount (in token's smallest unit).
     * @param amountOut    The calculated output token amount (in token's smallest unit).
     * @param feeDeducted  The protocol fee component (in input token's smallest unit).
     */
    event SwapExecuted(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 feeDeducted
    );

    /// @notice Emitted when the treasury wallet is updated.
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    /// @notice Emitted when the protocol fee basis points are updated.
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    /// @notice Emitted when the mock exchange rate is updated.
    event ExchangeRateUpdated(uint256 oldRate, uint256 newRate);

    // ─────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────

    /**
     * @param _treasuryWallet  The initial Velo treasury address (must be non-zero).
     * @param _feeBasisPoints  Fee in basis points, e.g. 100 = 1%. Cannot exceed 10000.
     * @param _exchangeRate    Mock exchange multiplier, e.g. 2 means 1 tokenA = 2 tokenB.
     */
    constructor(
        address _treasuryWallet,
        uint256 _feeBasisPoints,
        uint256 _exchangeRate
    ) Ownable(msg.sender) {
        require(_treasuryWallet != address(0), "VeloRouter: treasury cannot be the zero address");
        require(_feeBasisPoints <= 10000, "VeloRouter: fee cannot exceed 100%");
        require(_exchangeRate > 0, "VeloRouter: exchange rate must be greater than zero");

        treasuryWallet = _treasuryWallet;
        feeBasisPoints = _feeBasisPoints;
        exchangeRate = _exchangeRate;
    }

    // ─────────────────────────────────────────────────────────────────
    // Route A: HBAR → Token
    // ─────────────────────────────────────────────────────────────────

    /**
     * @notice Entry point for swapping native HBAR for an HTS token (Route A).
     *
     * @dev The user attaches native HBAR via `setPayableAmount()` in HashConnect.
     *      The contract validates the fee, stores all HBAR internally, and emits
     *      HbarSwapRequested for the backend to dispatch the correct token amount.
     *
     *      WHY all HBAR is kept in the contract, not sent to treasury immediately:
     *      Sending HBAR from this EVM contract to a Hedera long-form account (0.0.X)
     *      that hasn't explicitly called `receive()` can fail with INVALID_SIGNATURE
     *      or similar errors in certain wallet configurations. It is safer to let the
     *      treasury owner call withdrawHbar() at their convenience.
     *
     * @param tokenOut        EVM address of the HTS token the user wants to receive.
     * @param expectedTokenOut The pre-calculated amount the backend should send, in
     *                         the token's smallest denomination. The frontend calculates
     *                         this from the live price feed.
     */
    function swapHbarForToken(
        address tokenOut,
        uint256 expectedTokenOut
    ) external payable {
        // ── Validation ────────────────────────────────────────────────
        require(tokenOut != address(0), "VeloRouter: tokenOut cannot be the zero address");
        require(msg.value > 0, "VeloRouter: must attach HBAR to this call");
        require(expectedTokenOut > 0, "VeloRouter: expectedTokenOut must be greater than zero");

        // The total HBAR value must exceed the fixed protocol fee to be meaningful.
        require(
            msg.value > PROTOCOL_FEE_TINYBARS,
            "VeloRouter: HBAR amount too small to cover the 0.25 HBAR protocol fee"
        );

        // ── Business Logic ─────────────────────────────────────────────
        // All HBAR (principal + fee) stays inside this contract.
        // The backend calls withdrawHbar() to sweep it to the treasury.
        // This avoids any EVM-to-native-account transfer complexities.

        // ── Event Emission ─────────────────────────────────────────────
        // msg.sender is the user's EVM address (ECDSA alias for HashPack users).
        emit HbarSwapRequested(msg.sender, tokenOut, msg.value, expectedTokenOut);
    }

    // ─────────────────────────────────────────────────────────────────
    // Route B: Token → HBAR
    // ─────────────────────────────────────────────────────────────────

    /**
     * @notice Fee-collection and event-emission endpoint for Token → HBAR swaps (Route B).
     *
     * @dev ARCHITECTURAL NOTE — Why no `transferFrom` here:
     *      Hedera's EVM smart contracts cannot reliably use the ERC-20 `transferFrom`
     *      pattern with HTS tokens when the spender is an ECDSA-keyed account (as
     *      all HashPack users are). This is because:
     *        1. The EVM sees the user as their ECDSA alias address (0x-prefixed).
     *        2. But their allowances are recorded against their long-zero account
     *           address (0x000...00000{accountNum}).
     *        3. The HTS precompile at 0x167 checks allowances using the long-zero form,
     *           causing `CONTRACT_REVERT_EXECUTED` even with a valid allowance.
     *
     *      SOLUTION (Hybrid Split-Transaction Pattern):
     *        Step 1 (Frontend, BEFORE calling this function):
     *          Execute a native Hedera TransferTransaction to move the token from
     *          the user's account to the Treasury. This is a pure native ledger-level
     *          transaction that completely bypasses EVM. It always succeeds as long as
     *          the user has the balance and has signed the transaction.
     *
     *        Step 2 (This function):
     *          The user calls this contract, attaching the 0.25 HBAR protocol fee via
     *          msg.value. The contract validates the fee, stores it in its HBAR balance,
     *          and emits TokenForHbarSwapRequested.
     *
     *        Step 3 (Backend):
     *          The backend listens for TokenForHbarSwapRequested, cross-references the
     *          native token transfer on the mirror node to confirm the token was
     *          received by the treasury, then sends the equivalent HBAR to the user.
     *
     * @param tokenIn     EVM address of the HTS token the user sent to the treasury
     *                    (used for backend cross-referencing and event indexing only).
     * @param userAddress The user's EVM address (passed explicitly to avoid ECDSA
     *                    vs long-zero address ambiguity when msg.sender differs from
     *                    what the mirror node records as the token sender).
     * @param amountIn    The exact amount (in token's smallest unit) that the user
     *                    transferred to the treasury in the native transaction.
     */
    function payFeeForTokenToHbar(
        address tokenIn,
        address userAddress,
        uint256 amountIn
    ) external payable {
        // ── Validation ────────────────────────────────────────────────
        require(tokenIn != address(0), "VeloRouter: tokenIn cannot be the zero address");
        require(userAddress != address(0), "VeloRouter: userAddress cannot be the zero address");
        require(amountIn > 0, "VeloRouter: amountIn must be greater than zero");

        // Require the user attach EXACTLY the protocol fee — no more, no less.
        // This prevents griefing (sending huge amounts) and underpayment.
        require(
            msg.value == PROTOCOL_FEE_TINYBARS,
            "VeloRouter: must attach exactly 0.25 HBAR (25000000 tinybars) as the protocol fee"
        );

        // ── Event Emission ─────────────────────────────────────────────
        // The backend will:
        //   1. Verify the emit came from this trusted contract address.
        //   2. Cross-check the mirror node for a matching native token transfer
        //      (tokenIn, from userAddress → treasury) in the same ~5 second window.
        //   3. Calculate the HBAR payout and execute a treasury TransferTransaction.
        emit TokenForHbarSwapRequested(userAddress, tokenIn, amountIn);
    }

    // ─────────────────────────────────────────────────────────────────
    // Route C: Token → Token
    // ─────────────────────────────────────────────────────────────────

    /**
     * @notice Fee-collection and event-emission endpoint for Token → Token swaps (Route C).
     *
     * @dev Uses the same hybrid split-transaction pattern as Route B:
     *      The frontend first natively transfers tokenIn from the user to the Treasury,
     *      then calls this function to collect the HBAR fee and emit SwapExecuted.
     *      The backend reads the event and dispatches tokenOut to the user.
     *
     * @param tokenIn    EVM address of the input HTS token.
     * @param tokenOut   EVM address of the desired output HTS token.
     * @param userAddress The user's EVM address (for backend cross-referencing).
     * @param amountIn   The exact amount (in tokenIn's smallest unit) transferred natively.
     */
    function payFeeForTokenSwap(
        address tokenIn,
        address tokenOut,
        address userAddress,
        uint256 amountIn
    ) external payable {
        // ── Validation ────────────────────────────────────────────────
        require(tokenIn != address(0), "VeloRouter: tokenIn cannot be the zero address");
        require(tokenOut != address(0), "VeloRouter: tokenOut cannot be the zero address");
        require(tokenIn != tokenOut, "VeloRouter: tokenIn and tokenOut must be different tokens");
        require(userAddress != address(0), "VeloRouter: userAddress cannot be the zero address");
        require(amountIn > 0, "VeloRouter: amountIn must be greater than zero");

        // Require the user attach EXACTLY the protocol fee.
        require(
            msg.value == PROTOCOL_FEE_TINYBARS,
            "VeloRouter: must attach exactly 0.25 HBAR (25000000 tinybars) as the protocol fee"
        );

        // ── Calculations ────────────────────────────────────────────────
        // Calculate the fee component for event emission / analytics.
        // (This does not affect the swap amount; the fee is the attached HBAR, not a token slice.)
        uint256 feeAmount = (amountIn * feeBasisPoints) / 10000;

        // Calculate the expected output for the event (backend can use its own pricing).
        uint256 amountOut = amountIn * exchangeRate;

        // ── Event Emission ─────────────────────────────────────────────
        emit SwapExecuted(userAddress, tokenIn, tokenOut, amountIn, amountOut, feeAmount);
    }

    // ─────────────────────────────────────────────────────────────────
    // HBAR Receive & Treasury Sweep
    // ─────────────────────────────────────────────────────────────────

    /**
     * @notice Allows the contract to receive raw HBAR transfers (e.g., from top-ups).
     * @dev This is separate from the payable swap functions and handles plain transfers.
     */
    receive() external payable {}

    /**
     * @notice Sweeps all accumulated HBAR (protocol fees + any direct deposits) to the owner.
     * @dev Only callable by the contract owner (the treasury operator key).
     *      This is how the Velo treasury claims all accumulated HBAR fees.
     */
    function withdrawHbar() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "VeloRouter: no HBAR balance to withdraw");

        // Use call{value} instead of transfer to avoid gas limit issues on Hedera.
        (bool sent, ) = payable(owner()).call{value: balance}("");
        require(sent, "VeloRouter: HBAR withdrawal to owner failed");
    }

    /**
     * @notice Returns the current HBAR balance held in the contract (in tinybars).
     * @dev Useful for the frontend to display accumulated fees before a sweep.
     */
    function getContractHbarBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // ─────────────────────────────────────────────────────────────────
    // Admin Configuration
    // ─────────────────────────────────────────────────────────────────

    /**
     * @notice Updates the treasury wallet address.
     * @param _newTreasury New treasury address. Must be non-zero.
     */
    function setTreasuryWallet(address _newTreasury) external onlyOwner {
        require(_newTreasury != address(0), "VeloRouter: new treasury cannot be the zero address");
        emit TreasuryUpdated(treasuryWallet, _newTreasury);
        treasuryWallet = _newTreasury;
    }

    /**
     * @notice Updates the protocol fee in basis points.
     * @param _newFeeBP New fee. 100 = 1%, 10000 = 100%.
     */
    function setFeeBasisPoints(uint256 _newFeeBP) external onlyOwner {
        require(_newFeeBP <= 10000, "VeloRouter: fee cannot exceed 100% (10000 basis points)");
        emit FeeUpdated(feeBasisPoints, _newFeeBP);
        feeBasisPoints = _newFeeBP;
    }

    /**
     * @notice Updates the mock exchange rate.
     * @param _newRate New rate. Must be greater than zero.
     */
    function setExchangeRate(uint256 _newRate) external onlyOwner {
        require(_newRate > 0, "VeloRouter: exchange rate must be greater than zero");
        emit ExchangeRateUpdated(exchangeRate, _newRate);
        exchangeRate = _newRate;
    }
}
