/**
 * @file executeVeloMockSwap.ts
 * @description Production-ready TypeScript wrappers for all three VeloMockRouter swap routes.
 *
 * ARCHITECTURE OVERVIEW (Hedera EVM Constraint Context):
 * ─────────────────────────────────────────────────────
 * Hedera's EVM compatibility layer has a critical restriction: when an ECDSA-keyed
 * account (all HashPack/MetaMask users) interacts with a Solidity contract via
 * `ContractExecuteTransaction`, `msg.sender` resolves to their ECDSA alias address
 * (e.g. 0xAbCd…), NOT their native long-zero address (0x0000…000{accountNum}).
 *
 * HTS token allowances are, however, indexed by the long-zero address. This mismatch
 * causes `CONTRACT_REVERT_EXECUTED` on any contract `transferFrom` attempt, even if
 * the user correctly approved the contract via `AccountAllowanceApproveTransaction`.
 *
 * SOLUTION — Hybrid Split-Transaction Pattern for Token-In routes:
 *   1. Execute a NATIVE Hedera `TransferTransaction` to move the token from the user
 *      to the Velo Treasury. This is a pure ledger-level operation — no EVM involved,
 *      no alias issue, always works.
 *   2. Separately call the smart contract with `ContractExecuteTransaction`, attaching
 *      the 0.25 HBAR fee as `msg.value`. The contract validates the fee, stores it
 *      in its HBAR balance (the "fee pot"), and emits the appropriate swap event.
 *   3. The backend reads the event and the mirror node, verifies both transactions,
 *      and dispatches the output asset to the user.
 *
 * Route A (HBAR → Token):  executeHbarForTokenSwap()
 *   - No allowance needed. HBAR is native and attached via setPayableAmount().
 *   - Single ContractExecuteTransaction. Simple and clean.
 *
 * Route B (Token → HBAR):  executeTokenForHbarSwap()
 *   - Split: native TransferTransaction (token→treasury) + ContractExecuteTransaction (fee).
 *   - No AccountAllowanceApproveTransaction needed (native transfer bypasses EVM).
 *
 * Route C (Token → Token): executeTokenForTokenSwap()
 *   - Same split pattern as Route B.
 *   - No AccountAllowanceApproveTransaction needed.
 */

import {
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  TransferTransaction,
  AccountId,
  TokenId,
  Hbar,
} from "@hiero-ledger/sdk";
import { HashConnect } from "hashconnect";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The fixed protocol fee in HBAR that must be attached to all payable contract calls.
 * This equals 0.25 HBAR = 25,000,000 tinybars.
 */
const PROTOCOL_FEE_HBAR = new Hbar(0.25);

/**
 * Gas limit for fee-only calls (Routes B & C) — minimal logic, no HTS precompile.
 */
const GAS_FEE_CALL = 150_000;

/**
 * Gas limit for Route A — slightly more work (event emission + validation).
 */
const GAS_HBAR_SWAP = 200_000;

// ─────────────────────────────────────────────────────────────────────────────
// Utility: get signer safely
// ─────────────────────────────────────────────────────────────────────────────

function getSigner(hashconnect: HashConnect, accountId: string) {
  return hashconnect.getSigner(AccountId.fromString(accountId) as any) as any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route A: HBAR → Token  (swapHbarForToken)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @notice Route A — Swap native HBAR for an HTS token.
 *
 * HOW IT WORKS:
 *   1. User sets `hbarAmountIn` HBAR as the `setPayableAmount()` on the contract call.
 *   2. The contract validates the attached HBAR exceeds the 0.25 HBAR fee and emits
 *      a `HbarSwapRequested` event.
 *   3. The backend receives the event, verifies via the mirror node that HBAR was
 *      received by the contract, and dispatches the correct amount of tokenOut
 *      from the Velo treasury to the user.
 *
 * NO ALLOWANCE STEP needed — native HBAR does not require `approveTokenAllowance`.
 *
 * @param hashconnect     The initialized HashConnect instance.
 * @param accountId       The user's Hedera Account ID string (e.g. "0.0.12345").
 * @param routerContractId The deployed VeloMockRouter contract ID string.
 * @param tokenOutId      The Hedera Token ID of the token to receive (e.g. "0.0.8725045").
 * @param hbarAmountIn    The total HBAR the user is sending (e.g. 5.0 for 5 HBAR).
 *                        Must be > 0.25 HBAR (the minimum after the protocol fee).
 * @param expectedTokenOut The pre-calculated token output amount in the token's smallest
 *                         unit (e.g. 500_000_000 for 5 VELO with 8 decimals). Passed to
 *                         the contract purely for event emission — the backend does its
 *                         own authoritative calculation.
 * @returns The Hedera transaction ID of the contract call, for HashScan linking.
 */
export async function executeHbarForTokenSwap(
  hashconnect: HashConnect,
  accountId: string,
  routerContractId: string,
  tokenOutId: string,
  hbarAmountIn: number,
  expectedTokenOut: number
): Promise<string> {
  if (hbarAmountIn <= 0.25) {
    throw new Error(
      `HBAR amount (${hbarAmountIn}) must be greater than the 0.25 HBAR protocol fee.`
    );
  }
  if (expectedTokenOut <= 0) {
    throw new Error("Expected token output must be greater than zero.");
  }

  const signer = getSigner(hashconnect, accountId);

  // Convert Hedera Token ID to its EVM address for the Solidity function parameter.
  // TokenId.toSolidityAddress() returns the 20-byte hex without the 0x prefix.
  const tokenOutEvmAddress =
    "0x" + TokenId.fromString(tokenOutId).toSolidityAddress();

  // Build the function parameters matching:
  //   swapHbarForToken(address tokenOut, uint256 expectedTokenOut)
  const params = new ContractFunctionParameters()
    .addAddress(tokenOutEvmAddress)   // address tokenOut
    .addUint256(expectedTokenOut);    // uint256 expectedTokenOut

  // Build the ContractExecuteTransaction.
  // setPayableAmount() attaches the HBAR as msg.value in the Solidity function.
  // The FULL hbarAmountIn (principal + fee) is sent; the contract keeps all of it.
  const swapTx = new ContractExecuteTransaction()
    .setContractId(ContractId.fromString(routerContractId))
    .setGas(GAS_HBAR_SWAP)
    .setFunction("swapHbarForToken", params)
    .setPayableAmount(new Hbar(hbarAmountIn)); // Attaches HBAR as msg.value

  await (swapTx as any).freezeWithSigner(signer);
  const txResponse = await (swapTx as any).executeWithSigner(signer);
  const receipt = await (txResponse as any).getReceiptWithSigner(signer);

  if (receipt.status.toString() !== "SUCCESS") {
    throw new Error(
      `[Route A] swapHbarForToken failed with ledger status: ${receipt.status.toString()}`
    );
  }

  return txResponse.transactionId.toString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Route B: Token → HBAR  (payFeeForTokenToHbar — Hybrid Split Pattern)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @notice Route B — Swap an HTS token for native HBAR.
 *
 * HOW IT WORKS (Hybrid Split-Transaction — avoids Hedera ECDSA alias bug):
 *
 *   STEP 1 — Native Token Transfer (no EVM, no allowance needed):
 *     Execute a Hedera `TransferTransaction` to move `amountIn` of `tokenInId`
 *     directly from the user's account to the Velo treasury. This is a pure
 *     ledger-level operation signed via HashConnect. It ALWAYS works correctly
 *     regardless of key type or ECDSA alias issues.
 *
 *   STEP 2 — Contract Fee Payment & Event Emission:
 *     Call `payFeeForTokenToHbar()` on the VeloMockRouter, attaching exactly
 *     0.25 HBAR as `msg.value`. The contract validates the fee, stores it in its
 *     internal HBAR balance (the fee pot), and emits `TokenForHbarSwapRequested`.
 *
 *   STEP 3 — Backend Processing (handled in /api/contract-swap):
 *     The backend sees the `TokenForHbarSwapRequested` event, verifies the native
 *     token transfer on the mirror node (confirming the treasury received the tokens),
 *     and sends the calculated HBAR amount from the treasury to the user.
 *
 * WHY NO AccountAllowanceApproveTransaction:
 *   The native TransferTransaction is signed directly by the user's key — it does
 *   NOT go through an EVM `transferFrom`. Therefore, no on-chain allowance is
 *   required or used.
 *
 * @param hashconnect      The initialized HashConnect instance.
 * @param accountId        The user's Hedera Account ID string.
 * @param routerContractId The deployed VeloMockRouter contract ID string.
 * @param tokenInId        The Hedera Token ID of the token being sold (e.g. "0.0.8725045").
 * @param amountIn         The amount to sell in the token's smallest denomination
 *                         (e.g. 5_000_000 for 5 USDC with 6 decimals).
 * @param treasuryAccountId The Velo treasury Hedera account ID (e.g. "0.0.8642596").
 * @returns An object containing both transaction IDs (for transparent audit trails).
 */
export async function executeTokenForHbarSwap(
  hashconnect: HashConnect,
  accountId: string,
  routerContractId: string,
  tokenInId: string,
  amountIn: number,
  treasuryAccountId: string
): Promise<{ transferTxId: string; contractTxId: string }> {
  if (amountIn <= 0) {
    throw new Error("Token amount must be greater than zero.");
  }

  const signer = getSigner(hashconnect, accountId);

  // ── STEP 1: Native HTS Token Transfer ──────────────────────────────────────
  // Move the token from the user's account to the treasury.
  // This is a native Hedera operation — no EVM, no allowance, no alias bugs.
  const transferTx = new TransferTransaction()
    .addTokenTransfer(
      TokenId.fromString(tokenInId),
      AccountId.fromString(accountId),
      -amountIn  // Debit from user (negative = outgoing)
    )
    .addTokenTransfer(
      TokenId.fromString(tokenInId),
      AccountId.fromString(treasuryAccountId),
      amountIn   // Credit to treasury (positive = incoming)
    );

  await (transferTx as any).freezeWithSigner(signer);
  const transferResponse = await (transferTx as any).executeWithSigner(signer);
  const transferReceipt = await (transferResponse as any).getReceiptWithSigner(signer);

  if (transferReceipt.status.toString() !== "SUCCESS") {
    throw new Error(
      `[Route B] Native token transfer failed with status: ${transferReceipt.status.toString()}. ` +
      `Aborting before contract call to preserve user funds.`
    );
  }

  const transferTxId = transferResponse.transactionId.toString();

  // ── STEP 2: Contract Fee Payment & Event Emission ──────────────────────────
  // Call payFeeForTokenToHbar(), attaching exactly 0.25 HBAR as the protocol fee.
  // Pass the user's EVM address explicitly so the contract event is indexable.
  const userEvmAddress =
    "0x" + AccountId.fromString(accountId).toSolidityAddress();
  const tokenInEvmAddress =
    "0x" + TokenId.fromString(tokenInId).toSolidityAddress();

  // Matches Solidity: payFeeForTokenToHbar(address tokenIn, address userAddress, uint256 amountIn)
  const params = new ContractFunctionParameters()
    .addAddress(tokenInEvmAddress) // address tokenIn
    .addAddress(userEvmAddress)    // address userAddress
    .addUint256(amountIn);         // uint256 amountIn

  const feeTx = new ContractExecuteTransaction()
    .setContractId(ContractId.fromString(routerContractId))
    .setGas(GAS_FEE_CALL)
    .setFunction("payFeeForTokenToHbar", params)
    .setPayableAmount(PROTOCOL_FEE_HBAR); // Exactly 0.25 HBAR = 25,000,000 tinybars

  await (feeTx as any).freezeWithSigner(signer);
  const feeResponse = await (feeTx as any).executeWithSigner(signer);
  const feeReceipt = await (feeResponse as any).getReceiptWithSigner(signer);

  if (feeReceipt.status.toString() !== "SUCCESS") {
    throw new Error(
      `[Route B] payFeeForTokenToHbar contract call failed with status: ${feeReceipt.status.toString()}`
    );
  }

  return {
    transferTxId,
    contractTxId: feeResponse.transactionId.toString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Route C: Token → Token  (payFeeForTokenSwap — Hybrid Split Pattern)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @notice Route C — Swap one HTS token for another HTS token.
 *
 * Uses the same hybrid split-transaction pattern as Route B.
 *
 *   STEP 1 — Native Token Transfer: move tokenIn from user → treasury.
 *   STEP 2 — Contract Fee Payment:  call payFeeForTokenSwap() with 0.25 HBAR fee.
 *   STEP 3 — Backend dispatches tokenOut from treasury → user.
 *
 * @param hashconnect      The initialized HashConnect instance.
 * @param accountId        The user's Hedera Account ID string.
 * @param routerContractId The deployed VeloMockRouter contract ID string.
 * @param tokenInId        Hedera Token ID of the input token.
 * @param tokenInEvmAddress EVM address of the input token (pre-computed for efficiency).
 * @param tokenOutEvmAddress EVM address of the desired output token.
 * @param amountIn         Amount to sell in the token's smallest denomination.
 * @param treasuryAccountId The Velo treasury Hedera account ID.
 * @returns An object containing both transaction IDs.
 */
export async function executeTokenForTokenSwap(
  hashconnect: HashConnect,
  accountId: string,
  routerContractId: string,
  tokenInId: string,
  tokenInEvmAddress: string,
  tokenOutEvmAddress: string,
  amountIn: number,
  treasuryAccountId: string
): Promise<{ transferTxId: string; contractTxId: string }> {
  if (amountIn <= 0) {
    throw new Error("Token amount must be greater than zero.");
  }

  const signer = getSigner(hashconnect, accountId);

  // ── STEP 1: Native HTS Token Transfer ──────────────────────────────────────
  const transferTx = new TransferTransaction()
    .addTokenTransfer(
      TokenId.fromString(tokenInId),
      AccountId.fromString(accountId),
      -amountIn  // Debit from user
    )
    .addTokenTransfer(
      TokenId.fromString(tokenInId),
      AccountId.fromString(treasuryAccountId),
      amountIn   // Credit to treasury
    );

  await (transferTx as any).freezeWithSigner(signer);
  const transferResponse = await (transferTx as any).executeWithSigner(signer);
  const transferReceipt = await (transferResponse as any).getReceiptWithSigner(signer);

  if (transferReceipt.status.toString() !== "SUCCESS") {
    throw new Error(
      `[Route C] Native token transfer failed with status: ${transferReceipt.status.toString()}. ` +
      `Aborting before contract call.`
    );
  }

  const transferTxId = transferResponse.transactionId.toString();

  // ── STEP 2: Contract Fee Payment & Event Emission ──────────────────────────
  const userEvmAddress =
    "0x" + AccountId.fromString(accountId).toSolidityAddress();

  // Matches Solidity: payFeeForTokenSwap(address tokenIn, address tokenOut, address userAddress, uint256 amountIn)
  const params = new ContractFunctionParameters()
    .addAddress(tokenInEvmAddress)  // address tokenIn
    .addAddress(tokenOutEvmAddress) // address tokenOut
    .addAddress(userEvmAddress)     // address userAddress
    .addUint256(amountIn);          // uint256 amountIn

  const feeTx = new ContractExecuteTransaction()
    .setContractId(ContractId.fromString(routerContractId))
    .setGas(GAS_FEE_CALL)
    .setFunction("payFeeForTokenSwap", params)
    .setPayableAmount(PROTOCOL_FEE_HBAR);

  await (feeTx as any).freezeWithSigner(signer);
  const feeResponse = await (feeTx as any).executeWithSigner(signer);
  const feeReceipt = await (feeResponse as any).getReceiptWithSigner(signer);

  if (feeReceipt.status.toString() !== "SUCCESS") {
    throw new Error(
      `[Route C] payFeeForTokenSwap contract call failed with status: ${feeReceipt.status.toString()}`
    );
  }

  return {
    transferTxId,
    contractTxId: feeResponse.transactionId.toString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy export shim — keeps backward compatibility with SwapInterface.tsx
// during the transition. These will be removed in a future cleanup.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated Use executeTokenForTokenSwap() instead.
 */
export async function executeVeloMockSwap(
  hashconnect: HashConnect,
  accountId: string,
  routerContractId: string,
  tokenAId: string,
  tokenAAddress: string,
  tokenBAddress: string,
  amountIn: number
): Promise<string> {
  const treasuryId =
    process.env.NEXT_PUBLIC_TREASURY_ID || "0.0.8642596";
  const { contractTxId } = await executeTokenForTokenSwap(
    hashconnect,
    accountId,
    routerContractId,
    tokenAId,
    tokenAAddress,
    tokenBAddress,
    amountIn,
    treasuryId
  );
  return contractTxId;
}

/**
 * @deprecated Use executeHbarForTokenSwap() instead.
 */
export async function executeHbarSwap(
  hashconnect: HashConnect,
  accountId: string,
  routerContractId: string,
  tokenBAddress: string,
  hbarAmountIn: number,
  amountBOut: number
): Promise<string> {
  // Derive token ID from EVM address is not trivially reversible,
  // so pass the EVM address directly as the tokenOutId placeholder.
  // Route A only needs the EVM address, not the Hedera token ID.
  const signer = getSigner(hashconnect, accountId);

  const params = new ContractFunctionParameters()
    .addAddress(tokenBAddress)
    .addUint256(amountBOut);

  const swapTx = new ContractExecuteTransaction()
    .setContractId(ContractId.fromString(routerContractId))
    .setGas(GAS_HBAR_SWAP)
    .setFunction("swapHbarForToken", params)
    .setPayableAmount(new Hbar(hbarAmountIn));

  await (swapTx as any).freezeWithSigner(signer);
  const txResponse = await (swapTx as any).executeWithSigner(signer);
  const receipt = await (txResponse as any).getReceiptWithSigner(signer);

  if (receipt.status.toString() !== "SUCCESS") {
    throw new Error(`[Route A Legacy] HBAR swap failed: ${receipt.status.toString()}`);
  }

  return txResponse.transactionId.toString();
}
