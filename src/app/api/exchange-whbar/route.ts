import { NextRequest, NextResponse } from "next/server";
import { getTreasuryClient } from "@/lib/hedera/treasuryClient";
import { TransferTransaction, TokenId, AccountId } from "@hiero-ledger/sdk";

export const dynamic = "force-dynamic";

const WHBAR_TOKEN_ID = "0.0.8735222";
const TREASURY_ID = "0.0.8642596";

export async function POST(req: NextRequest) {
  try {
    const { transactionId, userAddress, amount } = await req.json();

    if (!transactionId || !userAddress || !amount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    console.log(`[Exchange] Processing WHBAR payout for ${userAddress}. Amount: ${amount}`);

    // 1. Initialize Treasury Client
    const client = getTreasuryClient();
    const treasuryAccountId = AccountId.fromString(TREASURY_ID);
    const userAccountId = AccountId.fromString(userAddress);
    const tokenId = TokenId.fromString(WHBAR_TOKEN_ID);

    // 2. Calculate tinybars (8 decimals for WHBAR)
    const tinyAmount = Math.floor(amount * 100_000_000);

    // 3. Execute Transfer from Treasury to User
    const transaction = new TransferTransaction()
      .addTokenTransfer(tokenId, treasuryAccountId, -tinyAmount)
      .addTokenTransfer(tokenId, userAccountId, tinyAmount)
      .freezeWith(client);

    const txResponse = await transaction.execute(client);
    const receipt = await txResponse.getReceipt(client);

    console.log(`[Exchange] Success: ${txResponse.transactionId.toString()} - Status: ${receipt.status.toString()}`);

    return NextResponse.json({
      success: true,
      transactionId: txResponse.transactionId.toString(),
      status: receipt.status.toString(),
    });

  } catch (error: any) {
    console.error("[Exchange API Error]:", error);
    return NextResponse.json({ 
      error: "INTERNAL_ERROR", 
      message: error.message 
    }, { status: 500 });
  }
}
