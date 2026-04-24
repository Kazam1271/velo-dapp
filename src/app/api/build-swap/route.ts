import { 
  TransferTransaction, 
  Client, 
  PrivateKey, 
  AccountId, 
  Hbar, 
  TransactionId, 
  TokenId,
  Transaction
} from "@hiero-ledger/sdk";
import { NextResponse } from "next/server";

// Mock Token prices for validation (Oracle)
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
    const { hbarAmount, tokenOutId, userAddress, expectedOut } = await req.json();
    
    if (!hbarAmount || !tokenOutId || !userAddress) {
      throw new Error("Missing required parameters: hbarAmount, tokenOutId, userAddress");
    }

    // 1. INITIALIZE HEDERA CLIENT (Oracle Context)
    const client = Client.forTestnet();
    const treasuryIdStr = process.env.TREASURY_ID!;
    const treasuryKeyStr = process.env.TREASURY_KEY!;
    
    const treasuryId = AccountId.fromString(treasuryIdStr);
    const cleanKey = treasuryKeyStr.startsWith("0x") ? treasuryKeyStr.slice(2) : treasuryKeyStr;
    const treasuryKey = PrivateKey.fromStringECDSA(cleanKey);
    const userAccountId = AccountId.fromString(userAddress);

    // 2. ORACLE: Fetch real HBAR price from SaucerSwap
    console.log("[Oracle] Fetching live HBAR price from SaucerSwap...");
    const priceResponse = await fetch('https://api.saucerswap.finance/tokens', {
      headers: { 'x-api-key': process.env.SAUCERSWAP_API_KEY! },
      next: { revalidate: 60 } // Cache for 1 min
    });
    
    let liveHbarUsd = 0.09;
    if (priceResponse.ok) {
        const tokensData = await priceResponse.json();
        const whbarData = tokensData.find((t: any) => t.symbol === 'WHBAR' || t.symbol === 'HBAR');
        if (whbarData) liveHbarUsd = parseFloat(whbarData.priceUsd);
    }
    console.log(`[Oracle] Live Rate: 1 HBAR = $${liveHbarUsd.toFixed(4)} USD`);

    // 3. VALIDATE REQUEST (Slippage check)
    const usdValuePaid = hbarAmount * liveHbarUsd;
    const mockPrice = MOCK_PRICES_USD[tokenOutId] || 0.10;
    const usdValueRequested = expectedOut * mockPrice;

    console.log(`[Oracle] User pays $${usdValuePaid.toFixed(2)} for $${usdValueRequested.toFixed(2)} worth of tokens.`);

    if (usdValueRequested > (usdValuePaid * 1.05)) {
      throw new Error(`Insufficient Payment: Swapping ${hbarAmount} HBAR ($${usdValuePaid.toFixed(2)}) for tokens worth $${usdValueRequested.toFixed(2)} exceeds 5% slippage.`);
    }

    // 4. BUILD THE ATOMIC TRANSACTION
    // Note: decimals are 6 for most tokens in this dApp, except VELO/WHBAR which are 8
    const decimalsOut = (tokenOutId === "0.0.8735222" || tokenOutId === "0.0.8725045") ? 8 : 6;
    const recvTiny = Math.floor(expectedOut * Math.pow(10, decimalsOut));
    
    const tx = new TransferTransaction()
      .addHbarTransfer(userAccountId, new Hbar(-hbarAmount))
      .addHbarTransfer(treasuryId, new Hbar(hbarAmount))
      .addTokenTransfer(tokenOutId, treasuryId, -recvTiny)
      .addTokenTransfer(tokenOutId, userAccountId, recvTiny)
      .setTransactionId(TransactionId.generate(userAccountId)); // User pays network fees

    // 5. FREEZE AND CO-SIGN (As Treasury)
    tx.freezeWith(client);
    const signedTx = await tx.sign(treasuryKey);
    const txBytes = Buffer.from(signedTx.toBytes()).toString('hex');

    console.log("[Oracle] Transaction built and co-signed by Treasury.");

    return NextResponse.json({ 
      success: true, 
      transactionBytes: txBytes,
      calculatedRate: liveHbarUsd
    });

  } catch (error: any) {
    console.error("[Oracle API Error]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
