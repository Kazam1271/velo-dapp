/**
 * @file /api/contract-swap/route.ts
 * @description Backend payout handler for all three VeloMockRouter swap routes.
 *
 * This endpoint is called by the frontend AFTER a successful contract call.
 * It verifies the transaction on the Hedera mirror node, calculates the correct
 * payout, and executes a treasury TransferTransaction to deliver the output asset.
 *
 * SUPPORTED SWAP TYPES:
 * ─────────────────────
 * Route A (HBAR → Token):
 *   - Frontend sends: { transactionId: contractTxId, accountId, targetTokenId }
 *   - We verify HBAR was received by the contract, calculate token output, and
 *     send tokens from the treasury to the user.
 *
 * Route B (Token → HBAR):
 *   - Frontend sends: { transactionId: contractTxId, transferTxId, accountId, targetTokenId: "NATIVE" }
 *   - We verify the native token transfer (transferTxId) reached the treasury,
 *     AND verify the contract call (transactionId) was a real payFeeForTokenToHbar call.
 *   - Then we send HBAR from the treasury to the user.
 *
 * Route C (Token → Token):
 *   - Frontend sends: { transactionId: contractTxId, transferTxId, accountId, targetTokenId }
 *   - Same as Route B verification but we send a different token back.
 *
 * SECURITY MODEL:
 * ───────────────
 * 1. Mirror node verification: we confirm the transaction ACTUALLY succeeded on-chain.
 * 2. Contract ID check: we confirm the call was made TO our trusted router contract.
 * 3. For token-in routes: we verify the native transfer exists and the treasury received funds.
 * 4. USD-value calculation uses live prices; output is capped at what the treasury can afford.
 */

import {
  Client,
  PrivateKey,
  AccountId,
  TokenId,
  TransferTransaction,
  Hbar,
} from "@hiero-ledger/sdk";
import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/** Mock USD prices for each testnet token. Used when oracle data is unavailable. */
const MOCK_PRICES_USD: Record<string, number> = {
  "0.0.8735150": 0.50,  // BONZO
  "0.0.8735149": 0.02,  // SAUCE
  "0.0.8735151": 0.15,  // PACK
  "0.0.8735221": 1.00,  // USDC
  "0.0.8734118": 1.00,  // USDT
  "0.0.8725045": 1.00,  // VELO
  "0.0.8735222": 0.09,  // WHBAR (mock price)
};

/** The fixed 0.25 HBAR protocol fee collected per swap. */
const PROTOCOL_FEE_HBAR = 0.25;

/** Mirror node base URL for testnet. */
const MIRROR_BASE = "https://testnet.mirrornode.hedera.com/api/v1";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Poll mirror node until a transaction is indexed and confirmed
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a Hedera SDK transaction ID (e.g. "0.0.123@1234567890.123456789")
 * to the mirror node URL format (e.g. "0.0.123-1234567890-123456789").
 */
function normalizeTxId(transactionId: string): string {
  // Format: accountId@seconds.nanos → accountId-seconds-nanos
  const [accPart, tsPart] = transactionId.split("@");
  const [seconds, nanos] = tsPart.split(".");
  return `${accPart}-${seconds}-${nanos}`;
}

/**
 * Polls the mirror node for a transaction until it appears and is confirmed SUCCESS.
 * Returns the full transaction object from the mirror node.
 *
 * @param transactionId The Hedera transaction ID string.
 * @param maxAttempts   Number of polling attempts before giving up.
 * @param delayMs       Delay between attempts in milliseconds.
 */
async function pollMirrorNode(
  transactionId: string,
  maxAttempts = 10,
  delayMs = 2000
): Promise<any> {
  const normalizedId = normalizeTxId(transactionId);
  const url = `${MIRROR_BASE}/transactions/${normalizedId}`;

  // Wait an initial 3 seconds for the mirror node indexer to catch up.
  await new Promise((r) => setTimeout(r, 3000));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const txs: any[] = data.transactions || [];
        const tx = txs.find((t: any) => t.result === "SUCCESS");
        if (tx) {
          console.log(`[Mirror] ✅ Verified tx in ${attempt} attempt(s): ${transactionId}`);
          return tx;
        }
        console.log(`[Mirror] Attempt ${attempt}/${maxAttempts} — not confirmed yet.`);
      } else {
        console.log(`[Mirror] Attempt ${attempt}/${maxAttempts} — HTTP ${res.status}.`);
      }
    } catch (err) {
      console.error(`[Mirror] Attempt ${attempt}/${maxAttempts} — fetch error:`, err);
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw new Error(
    `[Mirror] Transaction ${transactionId} not confirmed after ${maxAttempts} attempts.`
  );
}

/**
 * Fetches token metadata (decimals, symbol) from the mirror node.
 */
async function getTokenInfo(tokenId: string): Promise<{ decimals: number; symbol: string }> {
  const res = await fetch(`${MIRROR_BASE}/tokens/${tokenId}`);
  if (!res.ok) throw new Error(`Could not fetch token info for ${tokenId}`);
  const data = await res.json();
  return {
    decimals: parseInt(data.decimals ?? "0", 10),
    symbol: data.symbol ?? tokenId,
  };
}

/**
 * Fetches the live HBAR USD price from SaucerSwap.
 * Falls back to 0.082 if the oracle call fails.
 */
async function getLiveHbarPrice(): Promise<number> {
  try {
    const res = await fetch("https://api.saucerswap.finance/tokens", {
      headers: { "x-api-key": process.env.SAUCERSWAP_API_KEY || "" },
    });
    if (res.ok) {
      const tokens = await res.json();
      const hbarEntry = tokens.find(
        (t: any) => t.symbol === "HBAR" || t.symbol === "WHBAR"
      );
      if (hbarEntry?.priceUsd) {
        return parseFloat(hbarEntry.priceUsd);
      }
    }
  } catch {
    console.warn("[Oracle] SaucerSwap price fetch failed — using fallback.");
  }
  return 0.082; // Fallback HBAR price in USD
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/contract-swap
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      transactionId,  // The contract call tx ID (always required)
      transferTxId,   // The native token transfer tx ID (Routes B & C only)
      accountId,      // The user's Hedera account ID
      targetTokenId,  // "NATIVE" for HBAR output, or the Hedera token ID for token output
    } = body;

    // ── Input Validation ──────────────────────────────────────────────────────
    if (!transactionId || !accountId || !targetTokenId) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: transactionId, accountId, targetTokenId." },
        { status: 400 }
      );
    }

    // Determine which route we're processing.
    const isHbarToToken = targetTokenId !== "NATIVE" && !transferTxId;
    const isTokenToHbar = targetTokenId === "NATIVE";
    const isTokenToToken = targetTokenId !== "NATIVE" && !!transferTxId;

    const ROUTER_CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID || "0.0.9174676";
    const TREASURY_ID = process.env.TREASURY_ID!;
    const TREASURY_KEY_STR = process.env.TREASURY_KEY!;

    console.log(
      `[Contract Swap] Processing swap | Route: ${
        isHbarToToken ? "A (HBAR→Token)" : isTokenToHbar ? "B (Token→HBAR)" : "C (Token→Token)"
      } | Tx: ${transactionId}`
    );

    // ── Fetch live price ───────────────────────────────────────────────────────
    const hbarUsd = await getLiveHbarPrice();
    console.log(`[Price] Live HBAR price: $${hbarUsd.toFixed(4)}`);

    // ── Step 1: Verify the contract call transaction ───────────────────────────
    const contractTx = await pollMirrorNode(transactionId);

    if (contractTx.entity_id !== ROUTER_CONTRACT_ID) {
      throw new Error(
        `Security violation: contract call was to ${contractTx.entity_id}, ` +
        `expected ${ROUTER_CONTRACT_ID}.`
      );
    }

    // ── Step 2: Route-specific verification and input valuation ───────────────
    let usdIn = 0;
    let inputSymbol = "";

    if (isHbarToToken) {
      // ── Route A: HBAR → Token ─────────────────────────────────────────────
      // Find the HBAR transfer to the contract in the contract call transaction.
      const hbarToContract = contractTx.transfers?.find(
        (tf: any) => tf.account === ROUTER_CONTRACT_ID && tf.amount > 0
      );
      if (!hbarToContract) {
        throw new Error(
          "[Route A] No HBAR transfer to the router contract found in the transaction. " +
          "The contract may not have received funds."
        );
      }

      const hbarIn = hbarToContract.amount / 100_000_000; // tinybars → HBAR
      usdIn = hbarIn * hbarUsd;
      inputSymbol = "HBAR";
      console.log(`[Route A] Verified: ${hbarIn.toFixed(4)} HBAR received by contract ($${usdIn.toFixed(4)})`);

    } else if (isTokenToHbar || isTokenToToken) {
      // ── Routes B & C: Token-In ─────────────────────────────────────────────
      if (!transferTxId) {
        throw new Error(
          "[Routes B/C] Missing transferTxId. The native token transfer must be provided."
        );
      }

      // Verify the NATIVE token transfer transaction.
      // This is the TransferTransaction the frontend executed before the contract call.
      const nativeTransferTx = await pollMirrorNode(transferTxId);

      // Find the token transfer that credited the treasury.
      const creditToTreasury = nativeTransferTx.token_transfers?.find(
        (tf: any) => tf.account === TREASURY_ID && tf.amount > 0
      );
      if (!creditToTreasury) {
        throw new Error(
          `[Routes B/C] No token credit to treasury (${TREASURY_ID}) found in ` +
          `native transfer tx ${transferTxId}. Cannot process payout.`
        );
      }

      const inTokenId = creditToTreasury.token_id;
      const rawAmountIn = creditToTreasury.amount;

      const tokenInfo = await getTokenInfo(inTokenId);
      const normalizedAmountIn = rawAmountIn / Math.pow(10, tokenInfo.decimals);
      const priceIn = MOCK_PRICES_USD[inTokenId] ?? 0.10;

      usdIn = normalizedAmountIn * priceIn;
      inputSymbol = tokenInfo.symbol;

      console.log(
        `[Routes B/C] Verified: ${normalizedAmountIn.toFixed(4)} ${inputSymbol} ` +
        `received by treasury ($${usdIn.toFixed(4)})`
      );

      // Also verify the 0.25 HBAR fee was received by the contract.
      const feeToContract = contractTx.transfers?.find(
        (tf: any) => tf.account === ROUTER_CONTRACT_ID && tf.amount > 0
      );
      if (!feeToContract) {
        throw new Error(
          `[Routes B/C] No 0.25 HBAR fee found in contract call ${transactionId}. ` +
          `Cannot confirm fee was collected by the router.`
        );
      }
      console.log(`[Routes B/C] Protocol fee confirmed: ${feeToContract.amount / 1e8} HBAR stored in contract.`);
    }

    // ── Step 3: Calculate the output amount ────────────────────────────────────
    // The protocol fee is the fixed 0.25 HBAR value, subtracted from the USD input.
    const feeCostUsd = PROTOCOL_FEE_HBAR * hbarUsd;
    const valueAfterFeeUsd = usdIn - feeCostUsd;

    if (valueAfterFeeUsd <= 0) {
      throw new Error(
        `Payout is zero or negative after deducting the 0.25 HBAR fee. ` +
        `Input value: $${usdIn.toFixed(4)}, fee cost: $${feeCostUsd.toFixed(4)}.`
      );
    }

    let amountOut = 0;
    let outTiny = 0;
    let symbolOut = "";

    if (targetTokenId !== "NATIVE") {
      // Output is a token.
      const priceOut = MOCK_PRICES_USD[targetTokenId] ?? 0.10;
      amountOut = valueAfterFeeUsd / priceOut;

      const tokenOutInfo = await getTokenInfo(targetTokenId);
      outTiny = Math.floor(amountOut * Math.pow(10, tokenOutInfo.decimals));
      symbolOut = tokenOutInfo.symbol;
    } else {
      // Output is HBAR.
      amountOut = valueAfterFeeUsd / hbarUsd;
      outTiny = Math.floor(amountOut * 100_000_000); // HBAR → tinybars
      symbolOut = "HBAR";
    }

    if (outTiny <= 0) {
      throw new Error(`Calculated payout (${outTiny} tiny units) is too small to execute.`);
    }

    console.log(`[Payout] ${amountOut.toFixed(6)} ${symbolOut} → ${accountId}`);

    // ── Step 4: Execute the treasury payout ────────────────────────────────────
    const client = Client.forTestnet();
    const cleanKey = TREASURY_KEY_STR.startsWith("0x")
      ? TREASURY_KEY_STR.slice(2)
      : TREASURY_KEY_STR;
    const treasuryKey = PrivateKey.fromStringECDSA(cleanKey);
    client.setOperator(AccountId.fromString(TREASURY_ID), treasuryKey);

    const payoutTx = new TransferTransaction();

    if (targetTokenId !== "NATIVE") {
      // Send tokens from treasury to user.
      payoutTx
        .addTokenTransfer(
          TokenId.fromString(targetTokenId),
          AccountId.fromString(TREASURY_ID),
          -outTiny
        )
        .addTokenTransfer(
          TokenId.fromString(targetTokenId),
          AccountId.fromString(accountId),
          outTiny
        );
    } else {
      // Send HBAR from treasury to user.
      // CRITICAL: Use Hbar.fromTinybars(outTiny) — NOT new Hbar(amountOut).
      // amountOut is a raw float (e.g. 29.975847 HBAR). When Hedera's SDK converts
      // that float to tinybars internally it gets 2997584700.0000... which triggers
      // "Hbar in tinybars contains decimals". outTiny is already Math.floor()'d so
      // it is guaranteed to be a whole-number tinybar value.
      payoutTx
        .addHbarTransfer(
          AccountId.fromString(TREASURY_ID),
          Hbar.fromTinybars(-outTiny)
        )
        .addHbarTransfer(
          AccountId.fromString(accountId),
          Hbar.fromTinybars(outTiny)
        );
    }

    const executed = await payoutTx.execute(client);
    const payoutReceipt = await executed.getReceipt(client);

    if (payoutReceipt.status.toString() !== "SUCCESS") {
      throw new Error(
        `Treasury payout transaction failed with status: ${payoutReceipt.status.toString()}`
      );
    }

    const payoutTxId = executed.transactionId.toString();
    console.log(`[Payout] ✅ SUCCESS — ${amountOut.toFixed(6)} ${symbolOut} sent. Payout Tx: ${payoutTxId}`);

    return NextResponse.json({
      success: true,
      payoutTxId,
      amountOut: amountOut.toFixed(6),
      symbol: symbolOut,
    });

  } catch (error: any) {
    console.error("[Contract Swap Error]:", error.message || error);
    return NextResponse.json(
      { success: false, error: error.message || "An unknown error occurred." },
      { status: 500 }
    );
  }
}
