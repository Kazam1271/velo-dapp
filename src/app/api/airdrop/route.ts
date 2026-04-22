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

    console.log(`[Airdrop] Request for ${accountId}`);

    // 1. Double check association via Mirror Node (Security/UX layer)
    const mirrorUrl = `https://testnet.mirrornode.hedera.com/api/v1/accounts/${accountId}/tokens?token.id=${VELO_TOKEN_ID}`;
    const mirrorResp = await fetch(mirrorUrl);
    const mirrorData = await mirrorResp.json();
    
    const isAssociated = mirrorData.tokens?.some((t: any) => t.token_id === VELO_TOKEN_ID);

    if (!isAssociated) {
      return NextResponse.json({ 
        error: "TOKEN_NOT_ASSOCIATED", 
        message: "User must associate VELO token before claiming." 
      }, { status: 400 });
    }

    // 2. Execute Transfer from Treasury
    const decimals = 8;
    const tinyAmount = AIRDROP_AMOUNT * Math.pow(10, decimals);

    const transaction = new TransferTransaction()
      .addTokenTransfer(VELO_TOKEN_ID, process.env.TREASURY_ID!, -tinyAmount)
      .addTokenTransfer(VELO_TOKEN_ID, accountId, tinyAmount)
      .freezeWith(getTreasuryClient());

    const txResponse = await transaction.execute(getTreasuryClient());
    const receipt = await txResponse.getReceipt(getTreasuryClient());

    console.log(`[Airdrop] Success: ${txResponse.transactionId.toString()}`);

    return NextResponse.json({
      success: true,
      transactionId: txResponse.transactionId.toString(),
      status: receipt.status.toString(),
    });

  } catch (error: any) {
    console.error("[Airdrop] Error:", error);
    return NextResponse.json({ 
      error: "Internal Server Error", 
      details: error.message 
    }, { status: 500 });
  }
}
