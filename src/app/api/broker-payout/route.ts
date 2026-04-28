import { Client, PrivateKey, AccountId, Hbar, TransferTransaction, TokenId } from "@hiero-ledger/sdk";
import { NextResponse } from "next/server";

const MOCK_PRICES_USD: Record<string, number> = {
  "0.0.8735150": 0.50, // BONZO
  "0.0.8735149": 0.02, // SAUCE (Mock)
  "0.0.8735151": 0.15, // PACK (Mock)
  "0.0.8735221": 1.00, // USDC (Mock)
  "0.0.8734118": 1.00, // USDT (Mock)
  "0.0.8725045": 1.00, // VELO (Mock)
  "0.0.8735222": 0.09, // WHBAR (Mock)
};

const BROKERAGE_FEE_HBAR = 0.25;

export async function POST(req: Request) {
  try {
    const { transactionId, accountId, targetTokenId } = await req.json();

    if (!transactionId || !accountId || !targetTokenId) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    // 1. Verify Transaction via Mirror Node with Retry Loop
    const treasuryId = process.env.TREASURY_ID!;
    const mirrorUrl = `https://testnet.mirrornode.hedera.com/api/v1/transactions/${transactionId}`;
    let transaction = null;
    let attempts = 0;

    while (attempts < 5) {
      const txRes = await fetch(mirrorUrl);
      if (txRes.ok) {
        const txData = await txRes.json();
        if (txData.transactions && txData.transactions.length > 0) {
          transaction = txData.transactions[0];
          if (transaction.result === "SUCCESS") break;
        }
      }
      attempts++;
      console.log(`[Broker Payout] Waiting for mirror node... attempt ${attempts}`);
      await new Promise(r => setTimeout(r, 2500)); // Wait 2.5s between retries
    }

    if (!transaction || transaction.result !== "SUCCESS") {
      throw new Error("Transaction verification failed. Not found or not successful on ledger.");
    }

    // 2. ORACLE: Fetch prices (Server-side)
    let hbarUsd = 0.08;
    try {
      const priceRes = await fetch('https://api.saucerswap.finance/tokens', {
        headers: { 'x-api-key': process.env.SAUCERSWAP_API_KEY || "" }
      });
      if (priceRes.ok) {
        const tokens = await priceRes.json();
        const hbar = tokens.find((t: any) => t.symbol === 'HBAR' || t.symbol === 'WHBAR');
        if (hbar) hbarUsd = parseFloat(hbar.priceUsd);
        
        // Update mock prices with live ones
        tokens.forEach((t: any) => {
          if (MOCK_PRICES_USD[t.tokenId]) MOCK_PRICES_USD[t.tokenId] = parseFloat(t.priceUsd);
        });
      }
    } catch (e) {}

    // 3. DETERMINE DIRECTION & CALCULATE PAYOUT
    let usdIn = 0;

    // Check for HBAR arrival at Treasury
    const hbarTransfer = transaction.transfers.find((tf: any) => tf.account === treasuryId && tf.amount > 0);
    if (hbarTransfer) {
      const amountInHbar = hbarTransfer.amount / 100_000_000; // tinybars to hbar
      usdIn = amountInHbar * hbarUsd;
    } else {
      // Check for Token arrival at Treasury
      const tokenTransfer = transaction.token_transfers.find((tf: any) => tf.account === treasuryId && tf.amount > 0);
      if (!tokenTransfer) throw new Error("Treasury received no funds. Verification failed.");
      
      const inTokenId = tokenTransfer.token_id;
      const rawIn = tokenTransfer.amount;
      
      const tokenInfoRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/tokens/${inTokenId}`);
      const tokenInfo = await tokenInfoRes.json();
      const amountIn = rawIn / Math.pow(10, tokenInfo.decimals || 0);
      
      const priceIn = MOCK_PRICES_USD[inTokenId] || 0.10;
      usdIn = amountIn * priceIn;
    }

    // 4. EXECUTE PAYOUT
    const client = Client.forTestnet();
    const treasuryKey = PrivateKey.fromStringECDSA(process.env.TREASURY_KEY!);
    const operatorId = AccountId.fromString(treasuryId);
    client.setOperator(operatorId, treasuryKey);

    const payoutTx = new TransferTransaction();

    if (targetTokenId === "NATIVE") {
      // Payout HBAR
      let hbarOut = usdIn / hbarUsd;
      hbarOut = Math.max(0, hbarOut - BROKERAGE_FEE_HBAR);
      if (hbarOut <= 0) throw new Error("Payout too small for fees.");
      
      payoutTx.addHbarTransfer(operatorId, new Hbar(-hbarOut))
              .addHbarTransfer(AccountId.fromString(accountId), new Hbar(hbarOut));
    } else {
      // Payout Token
      const priceOut = MOCK_PRICES_USD[targetTokenId] || 0.10;
      const hbarFeeInUsd = BROKERAGE_FEE_HBAR * hbarUsd;
      const amountOut = (usdIn - hbarFeeInUsd) / priceOut;
      
      const tokenInfoRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/tokens/${targetTokenId}`);
      const tokenInfo = await tokenInfoRes.json();
      const outTiny = Math.floor(amountOut * Math.pow(10, tokenInfo.decimals || 0));

      payoutTx.addTokenTransfer(TokenId.fromString(targetTokenId), operatorId, -outTiny)
              .addTokenTransfer(TokenId.fromString(targetTokenId), AccountId.fromString(accountId), outTiny);
    }

    const executed = await payoutTx.execute(client);
    const receipt = await executed.getReceipt(client);

    if (receipt.status.toString() !== "SUCCESS") {
      throw new Error(`Payout failed with status: ${receipt.status}`);
    }

    return NextResponse.json({ 
      success: true, 
      payoutTxId: executed.transactionId.toString()
    });

  } catch (error: any) {
    console.error("[Brokerage Payout Error]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
