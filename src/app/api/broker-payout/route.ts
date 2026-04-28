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

    console.log(`[Broker Payout] Received request for Tx: ${transactionId}, Target: ${targetTokenId}`);

    // 1. Verify Transaction via Mirror Node with Persistent Polling
    const treasuryId = process.env.TREASURY_ID!;
    // Normalize Tx ID: Mirror Node expects 0.0.xxxx-sssss-nnnnn instead of 0.0.xxxx@sssss.nnnnn
    const normalizedTxId = transactionId.replace(/[@.]/g, "-");
    const mirrorUrl = `https://testnet.mirrornode.hedera.com/api/v1/transactions/${normalizedTxId}`;
    let transaction = null;
    let attempts = 0;
    const maxAttempts = 6;

    console.log(`[0/6] Initial wait 3 seconds for indexer...`);
    await new Promise(r => setTimeout(r, 3000));

    while (attempts < maxAttempts) {
      attempts++;
      console.log(`[${attempts}/${maxAttempts}] Checking Mirror Node...`);
      
      try {
        const txRes = await fetch(mirrorUrl);
        if (txRes.ok) {
          const txData = await txRes.json();
          if (txData.transactions && txData.transactions.length > 0) {
            transaction = txData.transactions[0];
            if (transaction.result === "SUCCESS") {
              console.log(`[${attempts}/${maxAttempts}] Transaction found and verified!`);
              break;
            }
          }
        }
      } catch (e) {
        console.error(`[${attempts}/${maxAttempts}] Fetch error:`, e);
      }

      if (attempts < maxAttempts) {
        console.log(`[${attempts}/${maxAttempts}] Not found yet, retrying in 2s...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!transaction || transaction.result !== "SUCCESS") {
      console.error(`[Broker Payout] Verification timed out after 15s for Tx: ${transactionId}`);
      throw new Error("Verification failed: Transaction not found on ledger after 15s. Please contact support.");
    }

    // 2. ORACLE: Fetch live prices
    let hbarUsd = 0.08;
    try {
      const priceRes = await fetch('https://api.saucerswap.finance/tokens', {
        headers: { 'x-api-key': process.env.SAUCERSWAP_API_KEY || "" }
      });
      if (priceRes.ok) {
        const tokens = await priceRes.json();
        const hbar = tokens.find((t: any) => t.symbol === 'HBAR' || t.symbol === 'WHBAR');
        if (hbar) hbarUsd = parseFloat(hbar.priceUsd);
        
        tokens.forEach((t: any) => {
          if (MOCK_PRICES_USD[t.tokenId]) MOCK_PRICES_USD[t.tokenId] = parseFloat(t.priceUsd);
        });
      }
    } catch (e) {
      console.warn("[Broker Payout] Oracle failed, using fallbacks.");
    }

    // 3. DETERMINE DIRECTION & CALCULATE PAYOUT
    let usdIn = 0;
    let assetInSymbol = "";

    // Verify HBAR or Token arrival at Treasury
    const hbarTransfer = transaction.transfers.find((tf: any) => tf.account === treasuryId && tf.amount > 0);
    if (hbarTransfer) {
      const amountInHbar = hbarTransfer.amount / 100_000_000;
      usdIn = amountInHbar * hbarUsd;
      assetInSymbol = "HBAR";
      console.log(`Verified arrival of ${amountInHbar} HBAR at Treasury.`);
    } else {
      const tokenTransfer = transaction.token_transfers.find((tf: any) => tf.account === treasuryId && tf.amount > 0);
      if (!tokenTransfer) throw new Error("Treasury received no funds. Verification failed.");
      
      const inTokenId = tokenTransfer.token_id;
      const rawIn = tokenTransfer.amount;
      
      const tokenInfoRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/tokens/${inTokenId}`);
      const tokenInfo = await tokenInfoRes.json();
      const amountIn = rawIn / Math.pow(10, tokenInfo.decimals || 0);
      
      const priceIn = MOCK_PRICES_USD[inTokenId] || 0.10;
      usdIn = amountIn * priceIn;
      assetInSymbol = tokenInfo.symbol;
      console.log(`Verified arrival of ${amountIn} ${assetInSymbol} at Treasury.`);
    }

    // 4. EXECUTE PAYOUT
    const client = Client.forTestnet();
    const treasuryKey = PrivateKey.fromStringECDSA(process.env.TREASURY_KEY!);
    const operatorId = AccountId.fromString(treasuryId);
    client.setOperator(operatorId, treasuryKey);

    const payoutTx = new TransferTransaction();
    let logMsg = "";

    if (targetTokenId === "NATIVE") {
      let hbarOut = usdIn / hbarUsd;
      hbarOut = Math.max(0, hbarOut - BROKERAGE_FEE_HBAR);
      if (hbarOut <= 0) throw new Error("Payout too small for fees.");
      
      payoutTx.addHbarTransfer(operatorId, new Hbar(-hbarOut))
              .addHbarTransfer(AccountId.fromString(accountId), new Hbar(hbarOut));
      logMsg = `Sending ${hbarOut.toFixed(4)} HBAR to User ${accountId}...`;
    } else {
      const priceOut = MOCK_PRICES_USD[targetTokenId] || 0.10;
      const hbarFeeInUsd = BROKERAGE_FEE_HBAR * hbarUsd;
      const amountOut = (usdIn - hbarFeeInUsd) / priceOut;
      
      const tokenInfoRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/tokens/${targetTokenId}`);
      const tokenInfo = await tokenInfoRes.json();
      const outTiny = Math.floor(amountOut * Math.pow(10, tokenInfo.decimals || 0));

      payoutTx.addTokenTransfer(TokenId.fromString(targetTokenId), operatorId, -outTiny)
              .addTokenTransfer(TokenId.fromString(targetTokenId), AccountId.fromString(accountId), outTiny);
      logMsg = `Sending ${amountOut.toFixed(4)} ${tokenInfo.symbol} to User ${accountId}...`;
    }

    console.log(logMsg);
    try {
      const executed = await payoutTx.execute(client);
      const receipt = await executed.getReceipt(client);

      if (receipt.status.toString() === "SUCCESS") {
        console.log(`[Broker Payout] Success! Tx ID: ${executed.transactionId.toString()}`);
        return NextResponse.json({ 
          success: true, 
          payoutTxId: executed.transactionId.toString()
        });
      } else {
        throw new Error(`Payout failed with status: ${receipt.status}`);
      }
    } catch (execError: any) {
      if (execError.message.includes("TOKEN_NOT_ASSOCIATED_TO_ACCOUNT")) {
        // Fetch token info for the error message
        const tokenInfoRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/tokens/${targetTokenId}`);
        const tokenInfo = await tokenInfoRes.json();
        throw new Error(`Please associate ${tokenInfo.symbol || targetTokenId} in your wallet first!`);
      }
      throw execError;
    }

  } catch (error: any) {
    console.error("[Brokerage Payout Error]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
