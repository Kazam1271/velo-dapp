import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// XP per qualifying user transaction (used for airdrop allocation).
// Transfers award less than swaps/stakes.
const XP_BY_EVENT: Record<string, number> = {
  transfer: 20,
  stake: 100,
  swap: 100,
};
const EARLY_ADOPTER_XP = 500;
const ALLOWED_EVENTS = new Set(Object.keys(XP_BY_EVENT));

/**
 * Canonicalize a wallet identifier to a single key so a user's XP never splits
 * across their EVM alias (Reown/MetaMask) and their Hedera account id (HashPack).
 * Hedera "0.0.x" ids are resolved to their EVM address via the mainnet mirror node.
 */
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
      /* fall through to raw id */
    }
  }
  return w.toLowerCase();
}

export async function POST(req: Request) {
  try {
    const { walletAddress, eventType, refId } = await req.json();

    if (!walletAddress || !eventType) {
      return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });
    }
    if (!ALLOWED_EVENTS.has(eventType)) {
      return NextResponse.json({ success: false, error: 'Invalid eventType' }, { status: 400 });
    }

    const wallet = await normalizeWallet(walletAddress);

    // Replay protection: if this transaction was already rewarded, skip.
    if (refId) {
      const { data: existing } = await supabaseAdmin
        .from('xp_events')
        .select('id')
        .eq('tx_hash', refId)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ success: false, error: 'Already rewarded' }, { status: 400 });
      }
    }

    // Ensure the user exists (first sight grants the 500 XP Early Adopter bonus).
    const { data: existingUser } = await supabaseAdmin
      .from('velo_users')
      .select('xp, swap_count')
      .eq('wallet_address', wallet)
      .maybeSingle();

    if (!existingUser) {
      const { error: insErr } = await supabaseAdmin
        .from('velo_users')
        .insert([{ wallet_address: wallet, xp: EARLY_ADOPTER_XP }]);
      if (insErr) throw insErr;
      await supabaseAdmin
        .from('xp_events')
        .insert([{ wallet_address: wallet, event_type: 'early_adopter', xp_amount: EARLY_ADOPTER_XP }]);
    }

    const { data: current, error: fetchErr } = await supabaseAdmin
      .from('velo_users')
      .select('xp, swap_count')
      .eq('wallet_address', wallet)
      .single();
    if (fetchErr) throw fetchErr;

    const xpAmount = XP_BY_EVENT[eventType];
    const newXp = (current?.xp ?? 0) + xpAmount;
    const newSwapCount = (current?.swap_count ?? 0) + (eventType === 'swap' ? 1 : 0);

    const { error: updErr } = await supabaseAdmin
      .from('velo_users')
      .update({ xp: newXp, swap_count: newSwapCount, last_active_at: new Date().toISOString() })
      .eq('wallet_address', wallet);
    if (updErr) throw updErr;

    const { error: evErr } = await supabaseAdmin
      .from('xp_events')
      .insert([{ wallet_address: wallet, event_type: eventType, xp_amount: xpAmount, tx_hash: refId || null }]);
    if (evErr) throw evErr;

    return NextResponse.json({ success: true, xpAwarded: xpAmount, totalXp: newXp });
  } catch (error: any) {
    console.error('XP Reward Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
