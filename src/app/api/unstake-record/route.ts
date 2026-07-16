import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { STAKING_VAULT } from '@/config/contracts';

export const dynamic = 'force-dynamic';

const UNSTAKED_TOPIC = ethers.id('Unstaked(address,uint256)');

/**
 * Sync Supabase stake records (which drive daily XP accrual) with an on-chain
 * VeloStakingVault unstake. Authorization comes from the chain itself: we
 * verify the tx succeeded, targeted the vault, was sent by the stake owner,
 * and read the unstaked amount from the Unstaked event. Records are reduced
 * FIFO. Deduped per tx via the xp_events unique tx_hash constraint.
 */
export async function POST(req: Request) {
  try {
    const { txHash, accountId } = await req.json();
    if (!txHash || !accountId || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return NextResponse.json({ success: false, error: 'Missing/invalid parameters' }, { status: 400 });
    }

    // The mirror node can lag a few seconds behind consensus.
    let result: any = null;
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`https://mainnet-public.mirrornode.hedera.com/api/v1/contracts/results/${txHash}`);
      if (res.ok) {
        result = await res.json();
        if (result?.result) break;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!result || result.result !== 'SUCCESS') {
      return NextResponse.json({ success: false, error: 'Unstake tx not found or not successful' }, { status: 400 });
    }
    if (String(result.to).toLowerCase() !== STAKING_VAULT.toLowerCase()) {
      return NextResponse.json({ success: false, error: 'Tx is not a vault call' }, { status: 400 });
    }

    // The tx sender must be the stake owner's wallet.
    const accRes = await fetch(`https://mainnet-public.mirrornode.hedera.com/api/v1/accounts/${accountId}`);
    if (!accRes.ok) throw new Error('Could not resolve account');
    const ownerEvm = String((await accRes.json()).evm_address || '').toLowerCase();
    if (!ownerEvm || String(result.from).toLowerCase() !== ownerEvm) {
      return NextResponse.json({ success: false, error: 'Tx sender does not match account' }, { status: 401 });
    }

    // Read the unstaked amount (tinybars) from the Unstaked event.
    const log = (result.logs || []).find(
      (l: any) => (l.topics || [])[0] === UNSTAKED_TOPIC && String(l.address).toLowerCase() === STAKING_VAULT.toLowerCase()
    );
    if (!log) {
      return NextResponse.json({ success: false, error: 'No Unstaked event in tx' }, { status: 400 });
    }
    let unstakedHbar = Number(BigInt(log.data)) / 1e8;

    // Dedup: one processing per tx (0-XP marker row in xp_events).
    const { error: dedupErr } = await supabaseAdmin
      .from('xp_events')
      .insert([{ wallet_address: ownerEvm, event_type: 'unstake_marker', xp_amount: 0, tx_hash: `unstake-${txHash.toLowerCase()}` }]);
    if (dedupErr) {
      if ((dedupErr as any).code === '23505') {
        return NextResponse.json({ success: true, alreadyProcessed: true });
      }
      throw dedupErr;
    }

    // Reduce ACTIVE stake records FIFO until the unstaked amount is consumed.
    const { data: stakes, error: stakesErr } = await supabaseAdmin
      .from('stakes')
      .select('id, amount')
      .eq('user_id', accountId)
      .eq('status', 'ACTIVE')
      .eq('token_id', 'NATIVE')
      .order('timestamp', { ascending: true });
    if (stakesErr) throw stakesErr;

    for (const s of stakes || []) {
      if (unstakedHbar <= 1e-9) break;
      const rowAmount = Number(s.amount);
      if (unstakedHbar >= rowAmount - 1e-9) {
        await supabaseAdmin.from('stakes').update({ status: 'CLAIMED' }).eq('id', s.id);
        unstakedHbar -= rowAmount;
      } else {
        await supabaseAdmin.from('stakes').update({ amount: rowAmount - unstakedHbar }).eq('id', s.id);
        unstakedHbar = 0;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Unstake Record Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
