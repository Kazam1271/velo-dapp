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

    // 2. Verify Original Staking Transaction via Mirror Node
    const [accId, timestamp] = stakeRecord.staking_tx_id.split("@");
    const normalizedTxId = `${accId}-${timestamp.replace(".", "-")}`;
    const mirrorUrl = `https://testnet.mirrornode.hedera.com/api/v1/transactions/${normalizedTxId}`;
    
    const txRes = await fetch(mirrorUrl);
    if (!txRes.ok) {
      throw new Error("Could not verify original staking transaction on ledger.");
    }
    
    const txData = await txRes.json();
    const transaction = txData.transactions[0];
    if (!transaction || transaction.result !== "SUCCESS") {
      throw new Error("Original staking transaction was not successful.");
    }

    // 3. Calculate Reward (12.5% APY)
    const now = Date.now();
    const stakedTime = stakeRecord.timestamp; // in ms
    const daysElapsed = (now - stakedTime) / (1000 * 60 * 60 * 24);
    
    const apy = 0.125;
    let reward = stakeRecord.amount * (apy / 365) * daysElapsed;
    
    // Minimum reward of 0.1 so users see a gain immediately
    if (reward < 0.1) reward = 0.1;
    
    const totalPayout = stakeRecord.amount + reward;

    // 4. EXECUTE PAYOUT
    const treasuryId = process.env.TREASURY_ID!;
    const client = Client.forTestnet();
    const treasuryKey = PrivateKey.fromStringECDSA(process.env.TREASURY_KEY!);
    const operatorId = AccountId.fromString(treasuryId);
    client.setOperator(operatorId, treasuryKey);

    const payoutTx = new TransferTransaction();

    if (stakeRecord.token_id === "NATIVE") {
      const payoutTiny = Math.floor(totalPayout * 100_000_000);
      payoutTx.addHbarTransfer(operatorId, Hbar.fromTinybars(-payoutTiny))
              .addHbarTransfer(AccountId.fromString(accountId), Hbar.fromTinybars(payoutTiny));
    } else {
      const tokenInfoRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/tokens/${stakeRecord.token_id}`);
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
