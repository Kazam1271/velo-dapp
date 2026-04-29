import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");

    if (!accountId) {
      return NextResponse.json({ error: "Account ID is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("airdrops")
      .select("*")
      .eq("user_id", accountId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is 'no rows returned'
      throw error;
    }

    return NextResponse.json({ 
      hasClaimed: !!data 
    });

  } catch (error: any) {
    console.error("[Check Airdrop Error]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
