/**
 * test-swap.js
 * 
 * End-to-end integration test for all three VeloMockRouter swap routes.
 * 
 * Creates a fresh user account, funds it, then exercises:
 *   Route A: HBAR → Token  (swapHbarForToken)
 *   Route B: Token → HBAR  (Native Transfer + payFeeForTokenToHbar)
 *   Route C: Token → Token (Native Transfer + payFeeForTokenSwap)
 */

const {
  Client,
  PrivateKey,
  AccountCreateTransaction,
  TransferTransaction,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  TokenId,
  AccountId,
  ContractId,
  Hbar,
  TokenAssociateTransaction,
} = require("@hiero-ledger/sdk");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env.local") });

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const CONTRACT_ID       = "0.0.9174676"; // Deployed 2026-06-09
const MOCK_USDC_ID      = "0.0.8725045"; // Mock VELO token (8 decimals)
const MOCK_WHBAR_ID     = "0.0.8735222"; // Mock WHBAR token (8 decimals)
const PROTOCOL_FEE_HBAR = Hbar.fromTinybars(25_000_000); // 0.25 HBAR exactly

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Wraps a contract call so failures show the exact revert reason. */
async function executeContract(tx, client, label) {
  try {
    const res = await tx.execute(client);
    const receipt = await res.getReceipt(client);
    console.log(`  ✅ ${label}: ${receipt.status.toString()}`);
    return res;
  } catch (e) {
    console.error(`  ❌ ${label} FAILED: ${e.message}`);
    if (e.transactionId) {
      try {
        const { TransactionRecordQuery } = require("@hiero-ledger/sdk");
        const record = await new TransactionRecordQuery()
          .setTransactionId(e.transactionId)
          .execute(client);
        if (record.contractFunctionResult?.errorMessage) {
          console.error(`     Solidity revert: "${record.contractFunctionResult.errorMessage}"`);
        }
      } catch (_) {}
    }
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const operatorId  = process.env.TREASURY_ID;
  const operatorKey = process.env.TREASURY_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error("TREASURY_ID and TREASURY_KEY must be set in .env.local");
  }

  // Treasury client (operator)
  const client = Client.forTestnet();
  const cleanKey = operatorKey.startsWith("0x") ? operatorKey.slice(2) : operatorKey;
  const privateKey = PrivateKey.fromStringECDSA(cleanKey);
  client.setOperator(operatorId, privateKey);

  // ── Create a fresh test user account ───────────────────────────────────────
  console.log("\n📋 Creating test user account...");
  const userKey = PrivateKey.generateECDSA();
  const createTx = await new AccountCreateTransaction()
    .setKey(userKey)
    .setInitialBalance(new Hbar(5))  // Fund with 5 HBAR for fees
    .execute(client);
  const createReceipt = await createTx.getReceipt(client);
  const userAccountId = createReceipt.accountId;
  console.log(`  User: ${userAccountId.toString()}`);

  // User client (signs on behalf of user)
  const userClient = Client.forTestnet();
  userClient.setOperator(userAccountId, userKey);

  // ── Associate user with test tokens ────────────────────────────────────────
  console.log("\n🔗 Associating user with tokens...");
  const assocTx = await new TokenAssociateTransaction()
    .setAccountId(userAccountId)
    .setTokenIds([TokenId.fromString(MOCK_USDC_ID), TokenId.fromString(MOCK_WHBAR_ID)])
    .freezeWith(client)
    .sign(userKey);
  await (await assocTx.execute(client)).getReceipt(client);
  console.log("  ✅ Tokens associated");

  // ── Fund user with test tokens ──────────────────────────────────────────────
  console.log("\n💰 Funding user with 10 VELO (MOCK_USDC)...");
  const FUND_AMOUNT = 10_00_000_000; // 10 tokens @ 8 decimals
  await (await new TransferTransaction()
    .addTokenTransfer(TokenId.fromString(MOCK_USDC_ID), operatorId, -FUND_AMOUNT)
    .addTokenTransfer(TokenId.fromString(MOCK_USDC_ID), userAccountId, FUND_AMOUNT)
    .execute(client)
  ).getReceipt(client);
  console.log("  ✅ Funded");

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1 — Route A: HBAR → Token (swapHbarForToken)
  // Single contract call, HBAR attached as msg.value.
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n\n══════════════════════════════════════════");
  console.log("TEST 1 — Route A: HBAR → Token");
  console.log("══════════════════════════════════════════");

  const hbarAmountIn    = new Hbar(2);           // 2 HBAR total (0.25 fee + 1.75 principal)
  const expectedOut     = 200_000_000;            // Expected 2 output tokens @ 8 decimals
  const tokenOutEvmAddr = "0x" + TokenId.fromString(MOCK_USDC_ID).toSolidityAddress();

  const routeAParams = new ContractFunctionParameters()
    .addAddress(tokenOutEvmAddr)  // address tokenOut
    .addUint256(expectedOut);     // uint256 expectedTokenOut

  const routeATx = new ContractExecuteTransaction()
    .setContractId(ContractId.fromString(CONTRACT_ID))
    .setGas(200_000)
    .setFunction("swapHbarForToken", routeAParams)
    .setPayableAmount(hbarAmountIn); // Entire HBAR amount becomes msg.value

  await executeContract(routeATx, userClient, "swapHbarForToken(2 HBAR → 2 VELO)");

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2 — Route B: Token → HBAR (Native Transfer + payFeeForTokenToHbar)
  // Step 1: Native TransferTransaction (no EVM, no allowance)
  // Step 2: Contract call with 0.25 HBAR fee
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n\n══════════════════════════════════════════");
  console.log("TEST 2 — Route B: Token → HBAR");
  console.log("══════════════════════════════════════════");

  const SELL_AMOUNT     = 5_00_000_000; // 5 tokens @ 8 decimals
  const tokenInEvmAddr  = "0x" + TokenId.fromString(MOCK_USDC_ID).toSolidityAddress();
  const userEvmAddr     = "0x" + userAccountId.toSolidityAddress();

  // ── Step 1: Native Token Transfer (user → treasury) ──────────────────────
  console.log("\n  Step 1: Native token transfer (user → treasury)...");
  const nativeTransfer = new TransferTransaction()
    .addTokenTransfer(TokenId.fromString(MOCK_USDC_ID), userAccountId, -SELL_AMOUNT)
    .addTokenTransfer(TokenId.fromString(MOCK_USDC_ID), AccountId.fromString(operatorId), SELL_AMOUNT);

  await executeContract(nativeTransfer, userClient, "Native TransferTransaction (Token → Treasury)");

  // ── Step 2: Contract Fee Payment ─────────────────────────────────────────
  console.log("\n  Step 2: Contract fee call (payFeeForTokenToHbar)...");
  const routeBParams = new ContractFunctionParameters()
    .addAddress(tokenInEvmAddr) // address tokenIn
    .addAddress(userEvmAddr)    // address userAddress
    .addUint256(SELL_AMOUNT);   // uint256 amountIn

  const routeBTx = new ContractExecuteTransaction()
    .setContractId(ContractId.fromString(CONTRACT_ID))
    .setGas(150_000)
    .setFunction("payFeeForTokenToHbar", routeBParams)
    .setPayableAmount(PROTOCOL_FEE_HBAR); // Exactly 0.25 HBAR

  await executeContract(routeBTx, userClient, "payFeeForTokenToHbar(5 VELO, fee=0.25 HBAR)");

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3 — Route C: Token → Token (Native Transfer + payFeeForTokenSwap)
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n\n══════════════════════════════════════════");
  console.log("TEST 3 — Route C: Token → Token");
  console.log("══════════════════════════════════════════");

  const SWAP_AMOUNT      = 2_00_000_000; // 2 tokens @ 8 decimals
  const tokenOutEvmAddr2 = "0x" + TokenId.fromString(MOCK_WHBAR_ID).toSolidityAddress();

  // ── Step 1: Native Token Transfer (user → treasury) ──────────────────────
  console.log("\n  Step 1: Native token transfer (user → treasury)...");
  const nativeTransfer2 = new TransferTransaction()
    .addTokenTransfer(TokenId.fromString(MOCK_USDC_ID), userAccountId, -SWAP_AMOUNT)
    .addTokenTransfer(TokenId.fromString(MOCK_USDC_ID), AccountId.fromString(operatorId), SWAP_AMOUNT);

  await executeContract(nativeTransfer2, userClient, "Native TransferTransaction (Token → Treasury)");

  // ── Step 2: Contract Fee Payment ─────────────────────────────────────────
  console.log("\n  Step 2: Contract fee call (payFeeForTokenSwap)...");
  const routeCParams = new ContractFunctionParameters()
    .addAddress(tokenInEvmAddr)   // address tokenIn
    .addAddress(tokenOutEvmAddr2) // address tokenOut
    .addAddress(userEvmAddr)      // address userAddress
    .addUint256(SWAP_AMOUNT);     // uint256 amountIn

  const routeCTx = new ContractExecuteTransaction()
    .setContractId(ContractId.fromString(CONTRACT_ID))
    .setGas(150_000)
    .setFunction("payFeeForTokenSwap", routeCParams)
    .setPayableAmount(PROTOCOL_FEE_HBAR); // Exactly 0.25 HBAR

  await executeContract(routeCTx, userClient, "payFeeForTokenSwap(2 VELO → WHBAR, fee=0.25 HBAR)");

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n\n══════════════════════════════════════════");
  console.log("✅ ALL ROUTES PASSED SUCCESSFULLY");
  console.log("══════════════════════════════════════════");
  console.log(`  Contract:  ${CONTRACT_ID}`);
  console.log(`  Test User: ${userAccountId.toString()}`);
  console.log(`  View on HashScan: https://hashscan.io/testnet/account/${userAccountId.toString()}`);
}

main().catch((err) => {
  console.error("\n\n💥 TEST FAILED:", err.message || err);
  process.exit(1);
});
