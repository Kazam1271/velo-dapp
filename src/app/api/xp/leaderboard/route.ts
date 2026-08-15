import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Wallet keys are stored as EVM addresses, so every row needs a mirror-node
// lookup to get its native "0.0.x" id. That's an N+1 fan-out, which is fine at
// 100 rows and very much not fine at 1000 — hence the cache and the
// concurrency cap below. An address→id mapping never changes once it exists,
// so hits are held for a day; misses are accounts that simply aren't activated
// on Hedera yet (wallet connected, never transacted) and are re-checked sooner
// in case they since have been.
const ID_CACHE = new Map<string, { id: string | null; at: number }>();
const HIT_TTL = 24 * 60 * 60 * 1000;
const MISS_TTL = 10 * 60 * 1000;
// Measured against the mainnet mirror node: 50 concurrent lookups sustained
// ~140/sec with zero throttling, so a full 1000-row board resolves in ~7s cold
// and sub-second warm. Kept bounded rather than unbounded so the fan-out can't
// grow with the user table.
const RESOLVE_CONCURRENCY = 50;

/** Resolve a canonical wallet key (EVM address) to its native Hedera "0.0.x" id. */
async function resolveHederaId(wallet: string): Promise<string | null> {
  if (/^\d+\.\d+\.\d+$/.test(wallet)) return wallet;
  if (!wallet.startsWith('0x')) return null;

  const cached = ID_CACHE.get(wallet);
  if (cached && Date.now() - cached.at < (cached.id ? HIT_TTL : MISS_TTL)) {
    return cached.id;
  }

  let id: string | null = null;
  try {
    const res = await fetch(`https://mainnet-public.mirrornode.hedera.com/api/v1/accounts/${wallet}`);
    if (res.ok) {
      const data = await res.json();
      id = data.account || null;
    } else if (res.status !== 404) {
      // Throttled or upstream error — don't cache it as a miss, just retry next load.
      return cached?.id ?? null;
    }
  } catch {
    return cached?.id ?? null;
  }

  ID_CACHE.set(wallet, { id, at: Date.now() });
  return id;
}

/** Promise.all, but with a ceiling on how many run at once. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 1000);

    const { data, error } = await supabaseAdmin
      .from('velo_users')
      .select('wallet_address, display_name, xp, swap_count')
      .order('xp', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const rows = data || [];

    // Resolve EVM wallet keys to native Hedera ids, then look up Velo IDs
    // (profiles are keyed by the 0.0.x account id).
    const hederaIds = await mapWithConcurrency(rows, RESOLVE_CONCURRENCY, (u) =>
      resolveHederaId(u.wallet_address as string)
    );
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
