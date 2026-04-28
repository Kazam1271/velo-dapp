import { Client, PrivateKey, AccountId, Hbar, TransferTransaction } from "@hiero-ledger/sdk";
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
    const { transactionId, accountId } = await req.json();

    if (!transactionId || !accountId) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    // 1. Verify Transaction via Mirror Node
    const mirrorUrl = `https://testnet.mirrornode.hedera.com/api/v1/transactions/${transactionId}`;
    const txRes = await fetch(mirrorUrl);
    
    if (!txRes.ok) {
      // Retry after 2 seconds if not found (indexer lag)
      await new Promise(r => setTimeout(r, 2000));
      const retryRes = await fetch(mirrorUrl);
      if (!retryRes.ok) throw new Error("Transaction not found on ledger. Please wait or try again.");
    }

    const txData = await (txRes.ok ? txRes : await fetch(mirrorUrl)).json();
    const transaction = txData.transactions[0];

    if (!transaction || transaction.result !== "SUCCESS") {
      throw new Error("Transaction was not successful on-chain.");
    }

    // 2. Extract Token and Amount received by Treasury
    const treasuryId = process.env.TREASURY_ID!;
    const tokenTransfer = transaction.token_transfers.find((tf: any) => tf.account === treasuryId && tf.amount > 0);

    if (!tokenTransfer) {
      throw new Error("No token transfer to Treasury found in this transaction.");
    }

    const tokenId = tokenTransfer.token_id;
    const rawAmount = tokenTransfer.amount;

    // 3. Get Metadata (Decimals)
    const tokenInfoRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/tokens/${tokenId}`);
    const tokenInfo = await tokenInfoRes.json();
    const decimals = tokenInfo.decimals || 0;
    const amountIn = rawAmount / Math.pow(10, decimals);

    // 4. Price Calculation (Oracle + Fallback)
    let liveHbarUsd = 0.08;
    let liveTokenUsd = MOCK_PRICES_USD[tokenId] || 0.10;

    try {
      const priceResponse = await fetch('https://api.saucerswap.finance/tokens');
      if (priceResponse.ok) {
        const tokensData = await priceResponse.json();
        const hbarData = tokensData.find((t: any) => t.symbol === 'WHBAR' || t.symbol === 'HBAR');
        if (hbarData) liveHbarUsd = parseFloat(hbarData.priceUsd);

        // Find token price in SaucerSwap data or keep mock
        const saucerToken = tokensData.find((t: any) => t.tokenId === tokenId);
        if (saucerToken) liveTokenUsd = parseFloat(saucerToken.priceUsd);
      }
    } catch (priceError) {
      console.warn("Oracle failed, using fallback prices:", priceError);
    }

    // 5. Final Calculation
    const usdIn = amountIn * liveTokenUsd;
    let hbarPayout = usdIn / liveHbarUsd;
    
    // Subtract Brokerage Fee
    hbarPayout = Math.max(0, hbarPayout - BROKERAGE_FEE_HBAR);

    if (hbarPayout <= 0) {
      throw new Error("Payout amount too small to cover brokerage fees.");
    }

    // 6. Execute Payout
    const client = Client.forTestnet();
    const treasuryKey = PrivateKey.fromStringECDSA(process.env.TREASURY_KEY!);
    const operatorId = AccountId.fromString(process.env.TREASURY_ID!);

    client.setOperator(operatorId, treasuryKey);

    const payoutTx = await new TransferTransaction()
      .addHbarTransfer(operatorId, new Hbar(-hbarPayout))
      .addHbarTransfer(AccountId.fromString(accountId), new Hbar(hbarPayout))
      .setTransactionMemo(`Brokerage Payout: ${amountIn} ${tokenInfo.symbol} sold`)
      .execute(client);

    const receipt = await payoutTx.getReceipt(client);

    return NextResponse.json({
      success: true,
      hbarAmount: hbarPayout.toFixed(4),
      transactionId: payoutTx.transactionId.toString(),
      status: receipt.status.toString()
    });

  } catch (error: any) {
    console.error("[Broker Payout Error]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
