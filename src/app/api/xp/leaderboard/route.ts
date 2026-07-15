import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/** Resolve a canonical wallet key (EVM address) to its native Hedera "0.0.x" id. */
async function resolveHederaId(wallet: string): Promise<string | null> {
  if (/^\d+\.\d+\.\d+$/.test(wallet)) return wallet;
  if (!wallet.startsWith('0x')) return null;
  try {
    const res = await fetch(`https://mainnet-public.mirrornode.hedera.com/api/v1/accounts/${wallet}`);
    if (res.ok) {
      const data = await res.json();
      return data.account || null;
    }
  } catch {
    /* fall through */
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 500);

    const { data, error } = await supabaseAdmin
      .from('velo_users')
      .select('wallet_address, display_name, xp, swap_count')
      .order('xp', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const rows = data || [];

    // Resolve EVM wallet keys to native Hedera ids, then look up Velo IDs
    // (profiles are keyed by the 0.0.x account id).
    const hederaIds = await Promise.all(rows.map((u) => resolveHederaId(u.wallet_address as string)));
    const knownIds = hederaIds.filter((id): id is string => !!id);

    const profileByWallet = new Map<string, { veloId: string | null; avatarUrl: string | null }>();
    if (knownIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('wallet_id, velo_id, avatar_url')
        .in('wallet_id', knownIds);
      for (const p of profiles || []) {
        if (p.wallet_id) {
          profileByWallet.set(p.wallet_id as string, {
            veloId: (p.velo_id as string) || null,
            avatarUrl: (p.avatar_url as string) || null,
          });
        }
      }
    }

    const leaderboard = rows.map((u, i) => {
      const hederaId = hederaIds[i];
      const profile = hederaId ? profileByWallet.get(hederaId) : undefined;
      return {
        rank: i + 1,
        wallet: u.wallet_address as string,
        hederaId,
        veloId: profile?.veloId || null,
        avatarUrl: profile?.avatarUrl || null,
        displayName: (u.display_name as string) || null,
        xp: (u.xp as number) ?? 0,
        swaps: (u.swap_count as number) ?? 0,
      };
    });

    return NextResponse.json({ success: true, leaderboard });
  } catch (error: any) {
    console.error('Leaderboard Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
