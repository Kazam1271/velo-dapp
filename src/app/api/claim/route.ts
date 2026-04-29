import { NextRequest, NextResponse } from "next/server";
import { getTreasuryClient } from "@/lib/hedera/treasuryClient";
import { TransferTransaction } from "@hiero-ledger/sdk";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const VELO_TOKEN_ID = "0.0.8725045";
const AIRDROP_AMOUNT = 500; // Whole tokens

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
  try {
    const { accountId } = await req.json();

    if (!accountId) {
      return NextResponse.json({ error: "Account ID is required" }, { status: 400 });
    }

    // 1. Check if already claimed in Database
    const { data: existingClaim, error: fetchError } = await supabase
      .from("airdrops")
      .select("*")
      .eq("user_id", accountId)
      .single();

    if (existingClaim) {
      return NextResponse.json({ 
        error: "ALREADY_CLAIMED", 
        message: "This account has already claimed the Early Adopter Bonus." 
      }, { status: 400 });
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

    if (receipt.status.toString() === "SUCCESS") {
      // 3. Record in Database
      const { error: insertError } = await supabase
        .from("airdrops")
        .insert([
          {
            user_id: accountId,
            transaction_id: txResponse.transactionId.toString(),
            amount: AIRDROP_AMOUNT,
            timestamp: new Date().toISOString()
          }
        ]);

      if (insertError) {
        console.error("[Claim] DB Insert Error:", insertError);
        // We still return success because the tokens were sent, but the record failed.
        // In a production app, you might want more robust error handling here.
      }
    }

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
