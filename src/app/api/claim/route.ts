import { NextRequest, NextResponse } from "next/server";
import { getTreasuryClient } from "@/lib/hedera/treasuryClient";
import { TransferTransaction } from "@hiero-ledger/sdk";

export const dynamic = "force-dynamic";

const VELO_TOKEN_ID = "0.0.8725045";
const AIRDROP_AMOUNT = 500; // Whole tokens

export async function POST(req: NextRequest) {
  try {
    const { accountId } = await req.json();

    if (!accountId) {
      return NextResponse.json({ error: "Account ID is required" }, { status: 400 });
    }

    console.log(`[Claim] Processing 500 VELO for ${accountId}`);

    // 2. Execute Transfer from Treasury (0.0.8642596)
    const decimals = 8;
    const tinyAmount = AIRDROP_AMOUNT * Math.pow(10, decimals);

    const client = getTreasuryClient();
    const transaction = new TransferTransaction()
      .addTokenTransfer(VELO_TOKEN_ID, process.env.TREASURY_ID!, -tinyAmount)
      .addTokenTransfer(VELO_TOKEN_ID, accountId, tinyAmount)
      .freezeWith(client);

    const txResponse = await transaction.execute(client);
    const receipt = await txResponse.getReceipt(client);

    console.log(`[Claim] Success: ${txResponse.transactionId.toString()}`);

    return NextResponse.json({
      success: true,
      transactionId: txResponse.transactionId.toString(),
      status: receipt.status.toString(),
    });

  } catch (error: any) {
    console.error("[Claim] Error:", error);

    // Specific error mapping for Hedera Token Service
    if (error.message.includes("TOKEN_NOT_ASSOCIATED_TO_ACCOUNT")) {
      return NextResponse.json({ 
        error: "ASSOCIATION_REQUIRED", 
        message: "You must associate VELO with your account before claiming." 
      }, { status: 400 });
    }

    return NextResponse.json({ 
      error: "INTERNAL_ERROR", 
      message: error.message 
    }, { status: 500 });
  }
}
