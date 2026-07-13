import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Canonicalize to the same key XP is stored under (lowercased EVM address).
// Hedera "0.0.x" ids are resolved to their EVM address via the mainnet mirror node.
async function normalizeWallet(wallet: string): Promise<string> {
  const w = wallet.trim();
  if (w.startsWith('0x')) return w.toLowerCase();
  if (/^\d+\.\d+\.\d+$/.test(w)) {
    try {
      const res = await fetch(`https://mainnet-public.mirrornode.hedera.com/api/v1/accounts/${w}`);
      if (res.ok) {
        const data = await res.json();
        if (data.evm_address) return String(data.evm_address).toLowerCase();
      }
    } catch {
      /* fall through */
    }
  }
  return w.toLowerCase();
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawWallet = searchParams.get('wallet');

    if (!rawWallet) {
      return NextResponse.json({ success: false, error: "Missing wallet parameter" }, { status: 400 });
    }

    const walletAddress = await normalizeWallet(rawWallet);

    const { data: user, error: userError } = await supabaseAdmin
      .from('velo_users')
      .select('xp, swap_count')
      .eq('wallet_address', walletAddress)
      .single();

    if (userError || !user) {
      // Return 0 if not onboarded yet
      return NextResponse.json({ success: true, xp: 0, swap_count: 0 });
    }

    // Determine rank based on XP (simple gamification example)
    let rank = "Novice";
    if (user.xp >= 5000) rank = "Whale";
    else if (user.xp >= 2000) rank = "Pro Trader";
    else if (user.xp >= 1000) rank = "Regular";

    return NextResponse.json({ 
      success: true, 
      xp: user.xp, 
      swap_count: user.swap_count,
      rank 
    });

  } catch (error: any) {
    console.error("XP Balance Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
