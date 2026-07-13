import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

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

    const leaderboard = (data || []).map((u, i) => ({
      rank: i + 1,
      wallet: u.wallet_address as string,
      displayName: (u.display_name as string) || null,
      xp: (u.xp as number) ?? 0,
      swaps: (u.swap_count as number) ?? 0,
    }));

    return NextResponse.json({ success: true, leaderboard });
  } catch (error: any) {
    console.error('Leaderboard Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
