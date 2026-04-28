import { TransactionId, Client, PrivateKey, TransferTransaction, AccountId, Hbar, TokenId } from "@hiero-ledger/sdk";
import { NextResponse } from "next/server";

// Set arbitrary Mock Token prices for the Brokerage Model
const MOCK_PRICES_USD: Record<string, number> = {
  "0.0.8735150": 0.50, // BONZO
  "0.0.8735149": 0.02, // SAUCE (Mock)
  "0.0.8735151": 0.15, // PACK (Mock)
  "0.0.8735221": 1.00, // USDC (Mock)
  "0.0.8734118": 1.00, // USDT (Mock)
  "0.0.8725045": 1.00, // VELO (Mock)
  "0.0.8735222": 0.09, // WHBAR (Mock)
};

export async function POST(req: Request) {
  try {
    const { amountIn, tokenInId, tokenOutId, userAddress } = await req.json();
    
    // 1. INITIALIZE HEDERA CLIENT & IDENTITIES
    const client = Client.forTestnet();
    const treasuryId = process.env.TREASURY_ID!;
    const treasuryKeyStr = process.env.TREASURY_KEY!;
    const cleanKey = treasuryKeyStr.startsWith("0x") ? treasuryKeyStr.slice(2) : treasuryKeyStr;
    const treasuryKey = PrivateKey.fromStringECDSA(cleanKey);
    
    const userAccountId = AccountId.fromString(userAddress);
    const treasuryAccountId = AccountId.fromString(treasuryId);

    // 2. ORACLE: Fetch real HBAR price from SaucerSwap
    const priceResponse = await fetch('https://api.saucerswap.finance/tokens');
    if (!priceResponse.ok) throw new Error("Failed to fetch oracle prices.");
    const tokensData = await priceResponse.json();
    const whbarData = tokensData.find((t: any) => t.symbol === 'WHBAR' || t.symbol === 'HBAR');
    const liveHbarUsd = whbarData ? parseFloat(whbarData.priceUsd) : 0.08; 

    // 3. CALCULATE PAYOUT
    // Logic: Inbound USD Value = Outbound USD Value
    let usdValueIn = 0;
    if (tokenInId === "NATIVE") {
      usdValueIn = amountIn * liveHbarUsd;
    } else {
      const priceIn = MOCK_PRICES_USD[tokenInId] || 0.10;
      usdValueIn = amountIn * priceIn;
    }

    let amountOut = 0;
    if (tokenOutId === "NATIVE") {
      amountOut = usdValueIn / liveHbarUsd;
    } else {
      const priceOut = MOCK_PRICES_USD[tokenOutId] || 0.10;
      amountOut = usdValueIn / priceOut;
    }

    // 4. CONSTRUCT ATOMIC TRANSACTION
    const tx = new TransferTransaction();

    // ── Handle Input Side ──
    if (tokenInId === "NATIVE") {
      tx.addHbarTransfer(userAccountId, new Hbar(-amountIn))
        .addHbarTransfer(treasuryAccountId, new Hbar(amountIn));
    } else {
      const decimalsIn = (tokenInId === "0.0.8735222" || tokenInId === "0.0.8725045") ? 8 : 6;
      const amountInTiny = Math.floor(amountIn * Math.pow(10, decimalsIn));
      tx.addTokenTransfer(TokenId.fromString(tokenInId), userAccountId, -amountInTiny)
        .addTokenTransfer(TokenId.fromString(tokenInId), treasuryAccountId, amountInTiny);
    }

    // ── Handle Output Side ──
    if (tokenOutId === "NATIVE") {
      tx.addHbarTransfer(treasuryAccountId, new Hbar(-amountOut))
        .addHbarTransfer(userAccountId, new Hbar(amountOut));
    } else {
      const decimalsOut = (tokenOutId === "0.0.8735222" || tokenOutId === "0.0.8725045") ? 8 : 6;
      const amountOutTiny = Math.floor(amountOut * Math.pow(10, decimalsOut));
      tx.addTokenTransfer(TokenId.fromString(tokenOutId), treasuryAccountId, -amountOutTiny)
        .addTokenTransfer(TokenId.fromString(tokenOutId), userAccountId, amountOutTiny);
    }

    tx.setTransactionId(TransactionId.generate(userAccountId))
      .setNodeAccountIds([new AccountId(3)])
      .freezeWith(client);
    
    // Treasury co-signs the transaction
    const signedTx = await tx.sign(treasuryKey);
    const txBytes = Buffer.from(signedTx.toBytes()).toString('hex');

    return NextResponse.json({ 
      success: true, 
      transactionBytes: txBytes,
      amountOut: amountOut,
      rate: tokenInId === "NATIVE" ? `1 HBAR = $${liveHbarUsd.toFixed(4)} USD` : `Brokerage Exchange`
    });

  } catch (error: any) {
    console.error("[Build-Swap API Error]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
