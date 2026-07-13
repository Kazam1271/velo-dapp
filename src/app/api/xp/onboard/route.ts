import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: Request) {
  try {
    const { walletAddress: rawWallet } = await req.json();

    if (!rawWallet) {
      return NextResponse.json({ success: false, error: "Missing walletAddress" }, { status: 400 });
    }

    // Canonical key: lowercased address (matches /api/xp/reward + swap-reward).
    const walletAddress = String(rawWallet).toLowerCase();

    // Check if user already exists
    const { data: existingUser, error: userError } = await supabaseAdmin
      .from('velo_users')
      .select('xp')
      .eq('wallet_address', walletAddress)
      .single();

    if (existingUser) {
      // User already exists, return current XP
      return NextResponse.json({ success: true, xp: existingUser.xp, message: "User exists" });
    }

    // New user -> grant the 500 XP Early Adopter bonus (replaces the old 500 VELO token airdrop)
    const EARLY_ADOPTER_XP = 500;
    const { error: insertUserError } = await supabaseAdmin
      .from('velo_users')
      .insert([{ wallet_address: walletAddress, xp: EARLY_ADOPTER_XP }]);

    if (insertUserError) throw insertUserError;

    // Log the early-adopter bonus event
    const { error: insertEventError } = await supabaseAdmin
      .from('xp_events')
      .insert([{
        wallet_address: walletAddress,
        event_type: 'early_adopter',
        xp_amount: EARLY_ADOPTER_XP
      }]);

    if (insertEventError) throw insertEventError;

    return NextResponse.json({ success: true, xp: EARLY_ADOPTER_XP, message: "Early Adopter bonus: 500 XP granted" });

  } catch (error: any) {
    console.error("XP Onboard Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
