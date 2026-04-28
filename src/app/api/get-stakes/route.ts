import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ success: false, error: "Missing userId" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("stakes")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "ACTIVE");

    if (error) throw error;

    return NextResponse.json({ success: true, stakes: data });

  } catch (error: any) {
    console.error("[Get Stakes Error]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
