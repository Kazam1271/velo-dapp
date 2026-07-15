import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// 1 XP per 10 HBAR staked per day (floored). Keep in sync with the Earn UI.
const XP_PER_10_HBAR_PER_DAY = 1;
// Backfill at most this many missed days per stake per run.
const MAX_BACKFILL_DAYS = 90;

/** Canonicalize a wallet id the same way the other XP routes do. */
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

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/**
 * Accrue daily Velo XP for active HBAR stakes: floor(amount/10) XP per full
 * day elapsed. One xp_events row per stake per day, keyed
 * `stake-accrual-{stakeId}-{YYYY-MM-DD}` — the unique tx_hash constraint makes
 * this idempotent, so the daily cron and page-load triggers can both call it.
 */
export async function POST() {
  try {
    const { data: stakes, error } = await supabaseAdmin
      .from('stakes')
      .select('id, user_id, amount, timestamp, token_id, status')
      .eq('status', 'ACTIVE')
      .eq('token_id', 'NATIVE');
    if (error) throw error;

    let awardedEvents = 0;
    let totalXp = 0;

    for (const stake of stakes || []) {
      const xpPerDay = Math.floor((Number(stake.amount) / 10) * XP_PER_10_HBAR_PER_DAY);
      if (xpPerDay <= 0) continue;

      // Award one event per FULL day since the stake started, up to today.
      const startMs = Number(stake.timestamp);
      if (!startMs) continue;
      const daysElapsed = Math.floor((Date.now() - startMs) / 86400000);
      if (daysElapsed < 1) continue;

      const wallet = await normalizeWallet(String(stake.user_id));
      const firstDay = Math.max(1, daysElapsed - MAX_BACKFILL_DAYS + 1);

      for (let dayN = firstDay; dayN <= daysElapsed; dayN++) {
        const day = dayKey(new Date(startMs + dayN * 86400000));
        const refId = `stake-accrual-${stake.id}-${day}`;

        // Insert the event first — the unique tx_hash constraint rejects
        // duplicates, which is what makes re-runs safe.
        const { error: evErr } = await supabaseAdmin
          .from('xp_events')
          .insert([{ wallet_address: wallet, event_type: 'stake_daily', xp_amount: xpPerDay, tx_hash: refId }]);
        if (evErr) {
          // 23505 = unique violation -> already accrued for this day.
          if ((evErr as any).code !== '23505') console.error('stake-accrual insert error:', evErr.message);
          continue;
        }

        // Credit the user's XP total (create the user row if needed).
        const { data: user } = await supabaseAdmin
          .from('velo_users')
          .select('xp')
          .eq('wallet_address', wallet)
          .maybeSingle();
        if (user) {
          await supabaseAdmin
            .from('velo_users')
            .update({ xp: (user.xp ?? 0) + xpPerDay, last_active_at: new Date().toISOString() })
            .eq('wallet_address', wallet);
        } else {
          await supabaseAdmin
            .from('velo_users')
            .insert([{ wallet_address: wallet, xp: xpPerDay }]);
        }

        awardedEvents++;
        totalXp += xpPerDay;
      }
    }

    return NextResponse.json({ success: true, awardedEvents, totalXp });
  } catch (error: any) {
    console.error('Stake Accrual Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Vercel cron hits routes with GET.
export async function GET() {
  return POST();
}
