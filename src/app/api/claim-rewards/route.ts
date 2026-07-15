import { Client, PrivateKey, AccountId, Hbar, TransferTransaction, TokenId } from "@hiero-ledger/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: Request) {
  try {
    const { stakeId, accountId } = await req.json();

    if (!stakeId || !accountId) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    // 1. Fetch the stake record securely from DB
    const { data: stakeRecord, error: fetchError } = await supabase
      .from("stakes")
      .select("*")
      .eq("id", stakeId)
      .eq("user_id", accountId)
      .eq("status", "ACTIVE")
      .single();

    if (fetchError || !stakeRecord) {
      throw new Error("Active stake not found or does not belong to you.");
    }

    // 2. Verify Original Staking Transaction via the MAINNET Mirror Node.
    // Stakes are EVM transfers now, so staking_tx_id is an eth tx hash (0x…);
    // legacy records may still use the Hedera "0.0.x@ts" format.
    let verified = false;
    if (String(stakeRecord.staking_tx_id).startsWith("0x")) {
      const txRes = await fetch(`https://mainnet-public.mirrornode.hedera.com/api/v1/contracts/results/${stakeRecord.staking_tx_id}`);
      if (txRes.ok) {
        const tr = await txRes.json();
        verified = tr.result === "SUCCESS";
      }
    } else {
      const [accId, timestamp] = stakeRecord.staking_tx_id.split("@");
      const normalizedTxId = `${accId}-${timestamp.replace(".", "-")}`;
      const txRes = await fetch(`https://mainnet-public.mirrornode.hedera.com/api/v1/transactions/${normalizedTxId}`);
      if (txRes.ok) {
        const txData = await txRes.json();
        verified = txData.transactions?.[0]?.result === "SUCCESS";
      }
    }
    if (!verified) {
      throw new Error("Could not verify original staking transaction on ledger.");
    }

    // 3. Calculate Reward (5% APY, prorated by actual time staked).
    // NOTE: no minimum reward — a flat minimum let users stake tiny amounts
    // and claim instantly for free money, draining the treasury.
    const now = Date.now();
    const stakedTime = stakeRecord.timestamp; // in ms
    const daysElapsed = (now - stakedTime) / (1000 * 60 * 60 * 24);

    const apy = 0.05;
    const reward = Math.max(stakeRecord.amount * (apy / 365) * daysElapsed, 0);

    const totalPayout = stakeRecord.amount + reward;

    // 4. EXECUTE PAYOUT (mainnet)
    const treasuryId = process.env.TREASURY_ID || "0.0.10609462";
    const client = Client.forMainnet();
    const treasuryKey = PrivateKey.fromStringECDSA(
      (process.env.TREASURY_KEY || process.env.MAINNET_TREASURY_KEY!).replace(/^0x/, "")
    );
    const operatorId = AccountId.fromString(treasuryId);
    client.setOperator(operatorId, treasuryKey);

    const payoutTx = new TransferTransaction();

    if (stakeRecord.token_id === "NATIVE") {
      const payoutTiny = Math.floor(totalPayout * 100_000_000);
      payoutTx.addHbarTransfer(operatorId, Hbar.fromTinybars(-payoutTiny))
              .addHbarTransfer(AccountId.fromString(accountId), Hbar.fromTinybars(payoutTiny));
    } else {
      const tokenInfoRes = await fetch(`https://mainnet-public.mirrornode.hedera.com/api/v1/tokens/${stakeRecord.token_id}`);
      const tokenInfo = await tokenInfoRes.json();
      const outTiny = Math.floor(totalPayout * Math.pow(10, tokenInfo.decimals || 0));

      payoutTx.addTokenTransfer(TokenId.fromString(stakeRecord.token_id), operatorId, -outTiny)
              .addTokenTransfer(TokenId.fromString(stakeRecord.token_id), AccountId.fromString(accountId), outTiny);
    }

    const executed = await payoutTx.execute(client);
    const receipt = await executed.getReceipt(client);

    if (receipt.status.toString() !== "SUCCESS") {
      throw new Error(`Payout failed with status: ${receipt.status}`);
    }

    // 5. Update DB Status to CLAIMED
    const { error: updateError } = await supabase
      .from("stakes")
      .update({ status: "CLAIMED" })
      .eq("id", stakeId);

    if (updateError) {
      console.error("Failed to update stake status to CLAIMED", updateError);
    }

    return NextResponse.json({ 
      success: true, 
      payoutTxId: executed.transactionId.toString(),
      rewardEarned: reward
    });

  } catch (error: any) {
    console.error("[Claim Rewards Error]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
