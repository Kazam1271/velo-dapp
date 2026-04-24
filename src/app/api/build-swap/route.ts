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
};

export async function POST(req: Request) {
  try {
    const { hbarAmount, tokenOutId, userAddress } = await req.json();
    
    // 1. INITIALIZE HEDERA CLIENT & IDENTITIES
    const client = Client.forTestnet();
    const treasuryId = process.env.TREASURY_ID!;
    const treasuryKeyStr = process.env.TREASURY_KEY!;
    const cleanKey = treasuryKeyStr.startsWith("0x") ? treasuryKeyStr.slice(2) : treasuryKeyStr;
    const treasuryKey = PrivateKey.fromStringECDSA(cleanKey);
    
    const userAccountId = AccountId.fromString(userAddress);
    const treasuryAccountId = AccountId.fromString(treasuryId);
    const tokenId = TokenId.fromString(tokenOutId);

    // 2. ORACLE: Fetch real HBAR price from SaucerSwap
    console.log("[Brokerage] Fetching live HBAR price from SaucerSwap Oracle...");
    const priceResponse = await fetch('https://api.saucerswap.finance/tokens', {
      headers: {
        'x-api-key': process.env.SAUCERSWAP_API_KEY || ""
      }
    });
    
    if (!priceResponse.ok) throw new Error("Failed to fetch oracle prices from SaucerSwap.");
    const tokensData = await priceResponse.json();
    
    const whbarData = tokensData.find((t: any) => t.symbol === 'WHBAR' || t.symbol === 'HBAR');
    const liveHbarUsd = whbarData ? parseFloat(whbarData.priceUsd) : 0.09; 
    
    // 3. CALCULATE PAYOUT
    const mockPrice = MOCK_PRICES_USD[tokenOutId] || 0.10;
    const usdValueIn = hbarAmount * liveHbarUsd;
    const amountOut = usdValueIn / mockPrice;
    
    // Decimals handling
    const decimals = (tokenOutId === "0.0.8735222" || tokenOutId === "0.0.8725045") ? 8 : 6;
    const amountOutTiny = Math.floor(amountOut * Math.pow(10, decimals));

    console.log(`[Brokerage] Oracle: $${usdValueIn.toFixed(2)} USD in -> ${amountOut.toFixed(4)} tokens out`);

    // 4. CONSTRUCT ATOMIC TRANSACTION
    const tx = new TransferTransaction()
      .addHbarTransfer(userAccountId, new Hbar(-hbarAmount))
      .addHbarTransfer(treasuryAccountId, new Hbar(hbarAmount))
      .addTokenTransfer(tokenId, treasuryAccountId, -amountOutTiny)
      .addTokenTransfer(tokenId, userAccountId, amountOutTiny)
      .setTransactionId(TransactionId.generate(userAccountId)) // User is the payer
      .setNodeAccountIds([new AccountId(3)]); // Stick to node 3 for consistency

    // 5. FREEZE AND CO-SIGN
    tx.freezeWith(client);
    
    // Treasury co-signs the transaction
    const signedTx = await tx.sign(treasuryKey);
    const txBytes = Buffer.from(signedTx.toBytes()).toString('hex');

    return NextResponse.json({ 
      success: true, 
      transactionBytes: txBytes,
      amountOut: amountOut,
      rate: `1 HBAR = $${liveHbarUsd.toFixed(4)} USD`
    });

  } catch (error: any) {
    console.error("[Build-Swap API Error]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
