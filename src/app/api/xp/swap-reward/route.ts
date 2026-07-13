import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// The address of the VeloMainnetProxy contract (must match the one deployed and configured)
const VELO_PROXY_ADDRESS = (process.env.NEXT_PUBLIC_VELO_PROXY_ADDRESS || "").toLowerCase();

export async function POST(req: Request) {
  try {
    const { walletAddress: rawWallet, txHash } = await req.json();

    if (!rawWallet || !txHash) {
      return NextResponse.json({ success: false, error: "Missing parameters" }, { status: 400 });
    }

    // Canonical key: lowercased EVM address (matches onboarding + /api/xp/reward).
    const walletAddress = String(rawWallet).toLowerCase();

    // 1. Verify that this txHash hasn't been claimed yet
    const { data: existingEvent } = await supabaseAdmin
      .from('xp_events')
      .select('id')
      .eq('tx_hash', txHash)
      .single();

    if (existingEvent) {
      return NextResponse.json({ success: false, error: "Swap already rewarded" }, { status: 400 });
    }

    // 2. Fetch transaction details from Hedera Mirror Node (Mainnet)
    // txHash usually needs to be formatted without '0x' prefix if using some Mirror Node endpoints,
    // but the generic EVM tx endpoint accepts '0x'
    const mirrorUrl = `https://mainnet.mirrornode.hedera.com/api/v1/contracts/results/${txHash}`;
    const mirrorRes = await fetch(mirrorUrl);
    
    if (!mirrorRes.ok) {
      console.warn(`Mirror node fetch failed for ${txHash}`);
      // In production, we might want to queue and retry if the mirror node is lagging.
      // For this implementation, we throw.
      throw new Error("Transaction not found on Mirror Node or not confirmed yet");
    }

    const txData = await mirrorRes.json();

    // 3. Verify transaction was successful and interacted with our Proxy
    if (txData.result !== 'SUCCESS') {
      throw new Error("Transaction did not succeed");
    }

    const toAddress = (txData.to || "").toLowerCase();
    const contractIdAsEvm = (txData.contract_id || "").toLowerCase();
    
    // We check if the 'to' address or 'contract_id' matches our proxy
    if (toAddress !== VELO_PROXY_ADDRESS && !contractIdAsEvm.includes(VELO_PROXY_ADDRESS.replace('0x',''))) {
      throw new Error("Transaction did not interact with Velo Proxy");
    }

    // 4. Update XP and Swap Count
    const xpReward = 100;

    // We do an upsert or an RPC call in Supabase to increment safely.
    // For simplicity, we fetch, increment, update.
    const { data: user, error: userError } = await supabaseAdmin
      .from('velo_users')
      .select('xp, swap_count')
      .eq('wallet_address', walletAddress)
      .single();

    if (userError || !user) {
      throw new Error("User not found (must onboard first)");
    }

    const { error: updateError } = await supabaseAdmin
      .from('velo_users')
      .update({ 
        xp: user.xp + xpReward,
        swap_count: user.swap_count + 1,
        last_active_at: new Date().toISOString()
      })
      .eq('wallet_address', walletAddress);

    if (updateError) throw updateError;

    // 5. Log the event
    const { error: eventError } = await supabaseAdmin
      .from('xp_events')
      .insert([{
        wallet_address: walletAddress,
        event_type: 'swap',
        xp_amount: xpReward,
        tx_hash: txHash
      }]);

    if (eventError) throw eventError;

    return NextResponse.json({ success: true, xpAwarded: xpReward });

  } catch (error: any) {
    console.error("XP Swap Reward Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
