import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Wallet keys are stored as EVM addresses, so displaying the native "0.0.x" id
// needs a mirror-node lookup per row — an N+1 that scales with the user table.
// Resolved ids are persisted to velo_users.hedera_id (see add_hedera_id.sql),
// so each wallet is only ever resolved once; this in-memory cache is the layer
// in front of that, and the sole mechanism if the migration hasn't been run.
const ID_CACHE = new Map<string, { id: string | null; at: number }>();
const HIT_TTL = 24 * 60 * 60 * 1000;
const MISS_TTL = 10 * 60 * 1000;
// Measured against the mainnet mirror node: 50 concurrent lookups sustained
// ~140/sec with zero throttling. Kept bounded rather than unbounded so the
// fan-out can't grow with the user table.
const RESOLVE_CONCURRENCY = 50;

// A wallet with no id isn't activated on Hedera yet, but will get one the
// moment it first transacts — so misses are re-checked on this cadence rather
// than never, and (unlike hits) are never treated as settled.
const MISS_RECHECK_MS = 6 * 60 * 60 * 1000;
// First load after the migration backfills the whole table; cap the writes per
// request so that one request doesn't stall, and let it converge over a few.
const MAX_PERSIST_PER_REQUEST = 300;
const PERSIST_CONCURRENCY = 10;

type UserRow = {
  wallet_address: string;
  display_name: string | null;
  xp: number | null;
  swap_count: number | null;
  hedera_id?: string | null;
  hedera_id_checked_at?: string | null;
};

// Undefined until the first query tells us whether add_hedera_id.sql has been
// run. Lets this deploy safely ahead of the migration instead of 500ing.
let hasIdColumns: boolean | undefined;

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

const BASE_COLUMNS = 'wallet_address, display_name, xp, swap_count';

/**
 * Fetch the top `limit` users, preferring the cached-id columns but degrading
 * to the base columns if add_hedera_id.sql hasn't been applied yet.
 */
async function fetchTopUsers(limit: number): Promise<UserRow[]> {
  if (hasIdColumns !== false) {
    const { data, error } = await supabaseAdmin
      .from('velo_users')
      .select(`${BASE_COLUMNS}, hedera_id, hedera_id_checked_at`)
      .order('xp', { ascending: false })
      .limit(limit);

    if (!error) {
      hasIdColumns = true;
      return (data || []) as UserRow[];
    }
    // 42703 = undefined_column — migration not run yet.
    if (error.code !== '42703') throw error;
    hasIdColumns = false;
    console.warn('[Leaderboard] hedera_id columns missing — run add_hedera_id.sql to stop re-resolving ids on every load.');
  }

  const { data, error } = await supabaseAdmin
    .from('velo_users')
    .select(BASE_COLUMNS)
    .order('xp', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as UserRow[];
}

/** Write freshly-resolved ids back so they're never resolved again. Best-effort. */
async function persistIds(updates: { wallet: string; id: string | null }[]) {
  if (!hasIdColumns || updates.length === 0) return;
  const checkedAt = new Date().toISOString();
  await mapWithConcurrency(
    updates.slice(0, MAX_PERSIST_PER_REQUEST),
    PERSIST_CONCURRENCY,
    async ({ wallet, id }) => {
      // Never let a cache write break the read path.
      const { error } = await supabaseAdmin
        .from('velo_users')
        .update({ hedera_id: id, hedera_id_checked_at: checkedAt })
        .eq('wallet_address', wallet);
      if (error) console.warn('[Leaderboard] id persist failed for', wallet, error.message);
    }
  );
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 1000);

    const rows = await fetchTopUsers(limit);

    // Only rows without a stored id need the mirror node. An unresolved wallet
    // is re-checked once its last check goes stale, since it may have since
    // transacted and been assigned an id.
    const staleBefore = Date.now() - MISS_RECHECK_MS;
    const needsLookup = rows.map((u) => {
      if (u.hedera_id) return false;
      if (!hasIdColumns) return true;
      const checkedAt = u.hedera_id_checked_at ? Date.parse(u.hedera_id_checked_at) : 0;
      return !(checkedAt > staleBefore);
    });

    // Start from what's already stored; the lookup pass fills in the gaps.
    const hederaIds: (string | null)[] = rows.map((u) => u.hedera_id ?? null);

    const resolvedNow: { wallet: string; id: string | null }[] = [];
    await mapWithConcurrency(
      rows.map((u, i) => ({ u, i })),
      RESOLVE_CONCURRENCY,
      async ({ u, i }) => {
        if (!needsLookup[i]) return;
        const id = await resolveHederaId(u.wallet_address);
        hederaIds[i] = id;
        resolvedNow.push({ wallet: u.wallet_address, id });
      }
    );

    // Cache what we just learned so subsequent loads skip the mirror node.
    await persistIds(resolvedNow);

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
