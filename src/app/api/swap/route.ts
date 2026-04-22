import { NextRequest, NextResponse } from "next/server";
import { getTreasuryClient } from "@/lib/hedera/treasuryClient";
import { TransferTransaction } from "@hiero-ledger/sdk";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { accountId, tokenToReceive, amount } = await req.json();

    if (!accountId || !tokenToReceive || !amount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    console.log(`[Swap API] Sending ${amount} of ${tokenToReceive} to ${accountId}`);

    const client = getTreasuryClient();
    const decimals = tokenToReceive === "0.0.8725045" ? 8 : 6; // VELO=8, USDC=6
    const tinyAmount = Math.floor(parseFloat(amount) * Math.pow(10, decimals));

    const transaction = new TransferTransaction()
      .addTokenTransfer(tokenToReceive, process.env.TREASURY_ID!, -tinyAmount)
      .addTokenTransfer(tokenToReceive, accountId, tinyAmount)
      .freezeWith(client);

    const txResponse = await transaction.execute(client);
    const receipt = await txResponse.getReceipt(client);

    return NextResponse.json({
      success: true,
      transactionId: txResponse.transactionId.toString(),
      status: receipt.status.toString(),
    });

  } catch (error: any) {
    console.error("[Swap API] Error:", error);
    return NextResponse.json({ 
      error: "INTERNAL_ERROR", 
      message: error.message 
    }, { status: 500 });
  }
}
