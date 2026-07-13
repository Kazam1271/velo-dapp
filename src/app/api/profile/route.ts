import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

function generateVeloId(): string {
  return `V-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
}

/**
 * Fetch-or-create a user's profile, keyed by their native Hedera account id.
 * The Velo ID is generated server-side exactly once per wallet and persisted
 * with the service role (client-side writes were silently blocked by RLS,
 * which caused a fresh ID to appear on every page load).
 *
 * Body: { walletId: "0.0.x", avatarUrl?: string }
 * - avatarUrl present: updates the profile's avatar.
 */
export async function POST(req: Request) {
  try {
    const { walletId, avatarUrl } = await req.json();

    if (!walletId || typeof walletId !== 'string' || !/^\d+\.\d+\.\d+$/.test(walletId.trim())) {
      return NextResponse.json({ success: false, error: 'Invalid walletId' }, { status: 400 });
    }
    const wallet = walletId.trim();

    // Optional avatar update (profile row must already exist or will be created below).
    if (avatarUrl && typeof avatarUrl === 'string') {
      const { error: avErr } = await supabaseAdmin
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('wallet_id', wallet);
      if (avErr) throw avErr;
    }

    // Return the existing profile if there is one.
    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('velo_id, avatar_url')
      .eq('wallet_id', wallet)
      .maybeSingle();

    if (existing?.velo_id) {
      return NextResponse.json({ success: true, veloId: existing.velo_id, avatarUrl: existing.avatar_url || null });
    }

    // Create once. ignoreDuplicates makes this race-safe: if a concurrent
    // request created the row first, ours is a no-op and we re-read theirs.
    const newId = generateVeloId();
    const { error: insErr } = await supabaseAdmin
      .from('profiles')
      .upsert({ wallet_id: wallet, velo_id: newId }, { onConflict: 'wallet_id', ignoreDuplicates: true });
    if (insErr) throw insErr;

    const { data: finalRow, error: readErr } = await supabaseAdmin
      .from('profiles')
      .select('velo_id, avatar_url')
      .eq('wallet_id', wallet)
      .single();
    if (readErr) throw readErr;

    return NextResponse.json({ success: true, veloId: finalRow.velo_id, avatarUrl: finalRow.avatar_url || null });
  } catch (error: any) {
    console.error('Profile Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
