import { NextRequest, NextResponse } from "next/server";
import { getTreasuryClient } from "@/lib/hedera/treasuryClient";
import { TransferTransaction } from "@hiero-ledger/sdk";
import { TOKEN_LIST } from "@/config/tokens";

export const dynamic = "force-dynamic";

/**
 * Verification & Fulfillment Engine
 * Logic:
 * 1. Verify HBAR payment hash on Mirror Node
 * 2. If valid, send tokens from Treasury back to user.
 */
export async function POST(req: NextRequest) {
  try {
    const { hash, accountId, targetToken, targetAmount } = await req.json();

    if (!hash || !accountId || !targetToken || !targetAmount) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    console.log(`[SwapFill] Verifying Hash: ${hash} for ${accountId}`);

    // --- 1. Verify on Mirror Node ---
    // We poll up to 15 times (total 30 seconds) for Mirror Node indexing
    let txData = null;
    for (let i = 0; i < 15; i++) {
      try {
        const mirrorResp = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/transactions/${hash}`);
        const data = await mirrorResp.json();
        
        if (data.transactions && data.transactions.length > 0) {
          txData = data.transactions[0];
          break;
        }
      } catch (e) {
        console.warn(`[SwapFill] Poll attempt ${i+1} failed...`);
      }
      await new Promise(r => setTimeout(r, 2000));
    }

    if (!txData) {
      return NextResponse.json({ error: "VERIFICATION_TIMEOUT", message: "Transaction not yet indexed on Mirror Node." }, { status: 408 });
    }

    if (txData.result !== "SUCCESS") {
      return NextResponse.json({ error: "TRANSACTION_FAILED", message: `Transaction failed on-chain: ${txData.result}` }, { status: 400 });
    }

    // --- 2. Fulfill Swap ---
    const client = getTreasuryClient();
    const tokenConfig = TOKEN_LIST.find(t => t.tokenId === targetToken);
    const decimals = tokenConfig?.decimals ?? 8;
    const tinyAmount = BigInt(Math.floor(parseFloat(targetAmount) * Math.pow(10, decimals)));

    console.log(`[SwapFill] Fulfillment: Sending ${targetAmount} of ${targetToken} to ${accountId}`);

    const transaction = new TransferTransaction()
      .addTokenTransfer(targetToken, process.env.TREASURY_ID!, -tinyAmount)
      .addTokenTransfer(targetToken, accountId, tinyAmount)
      .freezeWith(client);

    const txResponse = await transaction.execute(client);
    const receipt = await txResponse.getReceipt(client);

    return NextResponse.json({
      success: true,
      transactionId: txResponse.transactionId.toString(),
      status: receipt.status.toString(),
    });

  } catch (error: any) {
    console.error("[SwapFill] Error:", error);
    return NextResponse.json({ 
      error: "INTERNAL_ERROR", 
      message: error.message 
    }, { status: 500 });
  }
}
