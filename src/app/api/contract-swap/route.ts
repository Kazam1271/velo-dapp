import { Client, PrivateKey, AccountId, TokenId, TransferTransaction } from "@hiero-ledger/sdk";
import { NextResponse } from "next/server";

const MOCK_PRICES_USD: Record<string, number> = {
  "0.0.8735150": 0.50,  // BONZO
  "0.0.8735149": 0.02,  // SAUCE
  "0.0.8735151": 0.15,  // PACK
  "0.0.8735221": 1.00,  // USDC
  "0.0.8734118": 1.00,  // USDT
  "0.0.8725045": 1.00,  // VELO
  "0.0.8735222": 0.09,  // WHBAR
};

const ROUTER_CONTRACT_ID = "0.0.9167401"; // Updated on each redeploy

/**
 * POST /api/contract-swap
 * Called by the frontend after a successful swapHbarForToken() contract call.
 * Verifies the transaction on the mirror node, then sends tokens from the treasury.
 */
export async function POST(req: Request) {
  try {
    const { transactionId, accountId, targetTokenId } = await req.json();

    if (!transactionId || !accountId || !targetTokenId) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    console.log(`[Contract Swap] Verifying contract call: ${transactionId}`);

    // 1. Verify the contract call transaction via Mirror Node
    const [accPart, tsPart] = transactionId.split("@");
    const normalizedTxId = `${accPart}-${tsPart.replace(".", "-")}`;
    const mirrorUrl = `https://testnet.mirrornode.hedera.com/api/v1/transactions/${normalizedTxId}`;

    let transaction: any = null;
    let attempts = 0;
    const maxAttempts = 8;

    console.log(`[0/8] Waiting 3s for mirror node indexer...`);
    await new Promise(r => setTimeout(r, 3000));

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const txRes = await fetch(mirrorUrl);
        if (txRes.ok) {
          const txData = await txRes.json();
          if (txData.transactions && txData.transactions.length > 0) {
            transaction = txData.transactions[0];
            if (transaction.result === "SUCCESS") {
              console.log(`[${attempts}/${maxAttempts}] Contract call verified!`);
              break;
            }
          }
        }
      } catch (e) {
        console.error(`[${attempts}/${maxAttempts}] Fetch error:`, e);
      }
      if (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!transaction || transaction.result !== "SUCCESS") {
      throw new Error("Contract call not found or failed on ledger.");
    }

    // 2. Verify the transaction was a call TO our router contract
    if (transaction.entity_id !== ROUTER_CONTRACT_ID) {
      throw new Error(`Transaction was not sent to router contract ${ROUTER_CONTRACT_ID}.`);
    }

    // 3. Find the HBAR amount sent to the contract
    const contractHbarTransfer = transaction.transfers?.find(
      (tf: any) => tf.account === ROUTER_CONTRACT_ID && tf.amount > 0
    );
    if (!contractHbarTransfer) {
      throw new Error("No HBAR found sent to router contract in this transaction.");
    }

    const hbarAmountIn = contractHbarTransfer.amount / 100_000_000;
    console.log(`[Contract Swap] Verified ${hbarAmountIn} HBAR received by contract.`);

    // 4. Fetch live HBAR price
    let hbarUsd = 0.082;
    try {
      const priceRes = await fetch("https://api.saucerswap.finance/tokens", {
        headers: { "x-api-key": process.env.SAUCERSWAP_API_KEY || "" },
      });
      if (priceRes.ok) {
        const tokens = await priceRes.json();
        const hbarToken = tokens.find((t: any) => t.symbol === "HBAR" || t.symbol === "WHBAR");
        if (hbarToken) hbarUsd = parseFloat(hbarToken.priceUsd);
      }
    } catch {
      console.warn("[Contract Swap] Oracle failed, using fallback HBAR price.");
    }

    const usdIn = hbarAmountIn * hbarUsd;
    console.log(`[Contract Swap] Value: $${usdIn.toFixed(4)} USD`);

    // 5. Calculate output token amount
    const priceOut = MOCK_PRICES_USD[targetTokenId] ?? 0.10;
    const BROKERAGE_FEE_USD = 0.25 * hbarUsd;
    const amountOut = (usdIn - BROKERAGE_FEE_USD) / priceOut;

    const tokenInfoRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/tokens/${targetTokenId}`);
    const tokenInfo = await tokenInfoRes.json();
    const outTiny = Math.floor(amountOut * Math.pow(10, tokenInfo.decimals || 0));

    if (outTiny <= 0) throw new Error("Calculated payout is too small.");

    // 6. Send tokens from treasury to user
    const client = Client.forTestnet();
    const treasuryId = process.env.TREASURY_ID!;
    const treasuryKey = PrivateKey.fromStringECDSA(process.env.TREASURY_KEY!);
    client.setOperator(AccountId.fromString(treasuryId), treasuryKey);

    const payoutTx = new TransferTransaction()
      .addTokenTransfer(TokenId.fromString(targetTokenId), AccountId.fromString(treasuryId), -outTiny)
      .addTokenTransfer(TokenId.fromString(targetTokenId), AccountId.fromString(accountId), outTiny);

    const executed = await payoutTx.execute(client);
    const receipt = await executed.getReceipt(client);

    if (receipt.status.toString() !== "SUCCESS") {
      throw new Error(`Token payout failed: ${receipt.status.toString()}`);
    }

    console.log(`[Contract Swap] ✅ Sent ${amountOut.toFixed(4)} ${tokenInfo.symbol} to ${accountId}`);

    return NextResponse.json({
      success: true,
      payoutTxId: executed.transactionId.toString(),
      amountOut: amountOut.toFixed(4),
      symbol: tokenInfo.symbol,
    });

  } catch (error: any) {
    console.error("[Contract Swap Error]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
