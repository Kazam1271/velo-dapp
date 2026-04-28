import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Initialize Supabase with the service role key to bypass RLS and insert securely
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: Request) {
  try {
    const { userId, stakingTxId, amount, timestamp, tokenId } = await req.json();

    if (!userId || !stakingTxId || !amount || !timestamp || !tokenId) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("stakes")
      .insert([
        {
          user_id: userId,
          staking_tx_id: stakingTxId,
          amount: amount,
          timestamp: timestamp,
          token_id: tokenId,
          status: "ACTIVE"
        }
      ]);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, message: "Stake saved successfully" });

  } catch (error: any) {
    console.error("[Save Stake Error]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
