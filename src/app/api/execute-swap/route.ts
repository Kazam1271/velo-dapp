import { Transaction, Client, PrivateKey, TransferTransaction, AccountId } from "@hiero-ledger/sdk";
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
    const { transactionBytes, hbarAmount } = await req.json();
    
    // 1. INITIALIZE HEDERA CLIENT
    const client = Client.forTestnet();
    const treasuryId = process.env.TREASURY_ID!;
    const treasuryKeyStr = process.env.TREASURY_KEY!;
    const cleanKey = treasuryKeyStr.startsWith("0x") ? treasuryKeyStr.slice(2) : treasuryKeyStr;
    const treasuryKey = PrivateKey.fromStringECDSA(cleanKey);
    client.setOperator(treasuryId, treasuryKey);

    // 2. ORACLE: Fetch real HBAR price from SaucerSwap
    console.log("[Brokerage] Fetching live HBAR price from SaucerSwap Oracle...");
    const priceResponse = await fetch('https://api.saucerswap.finance/tokens', {
      headers: {
        'x-api-key': process.env.SAUCERSWAP_API_KEY!
      }
    });
    
    if (!priceResponse.ok) throw new Error("Failed to fetch oracle prices from SaucerSwap.");
    const tokensData = await priceResponse.json();
    
    // Find WHBAR (Mainnet ID: 0.0.1456986) to get the live USD price
    const whbarData = tokensData.find((t: any) => t.symbol === 'WHBAR' || t.symbol === 'HBAR');
    const liveHbarUsd = whbarData ? parseFloat(whbarData.priceUsd) : 0.09; 
    console.log(`[Brokerage] Oracle Price: 1 HBAR = $${liveHbarUsd} USD`);

    // 3. VALIDATE TRANSACTION INTEGRITY
    const tx = Transaction.fromBytes(Buffer.from(transactionBytes, 'hex'));
    if (!(tx instanceof TransferTransaction)) {
      throw new Error("Invalid transaction type. Only TransferTransactions are allowed.");
    }

    // Security Check: Verify the user isn't taking more than they paid for
    const hbarTransfers = tx.hbarTransfers;
    const tokenTransfers = tx.tokenTransfers;
    const treasuryAccId = AccountId.fromString(treasuryId);

    let hbarPaidByUser = 0;
    let tokensReceivedByUser: Record<string, number> = {};

    // Calculate how much HBAR the Treasury is receiving
    for (const [id, amount] of hbarTransfers) {
      if (id.toString() === treasuryAccId.toString() && BigInt(amount.toTinybars().toString()) > 0n) {
        hbarPaidByUser += Number(amount.toTinybars().toString()) / 1e8;
      }
    }

    // Calculate how many tokens the Treasury is sending out
    for (const [tokenId, accountTransfers] of tokenTransfers) {
      const tid = tokenId.toString();
      for (const [accountId, amount] of accountTransfers) {
        if (accountId.toString() === treasuryAccId.toString() && BigInt(amount.toString()) < 0n) {
          const decimals = (tid === "0.0.8735222" || tid === "0.0.8725045") ? 8 : 6;
          tokensReceivedByUser[tid] = (tokensReceivedByUser[tid] || 0) + (Math.abs(Number(amount.toString())) / Math.pow(10, decimals));
        }
      }
    }

    // Verify USD values align
    const usdValuePaid = hbarPaidByUser * liveHbarUsd;
    console.log(`[Brokerage] User Paid: ${hbarPaidByUser} HBAR ($${usdValuePaid.toFixed(2)} USD)`);

    for (const [tokenId, amount] of Object.entries(tokensReceivedByUser)) {
      const mockPrice = MOCK_PRICES_USD[tokenId] || 0.10; // Default $0.10 if unknown
      const usdValueReceived = amount * mockPrice;
      
      console.log(`[Brokerage] User Requested: ${amount} of ${tokenId} ($${usdValueReceived.toFixed(2)} USD)`);

      // 5% Slippage/Buffer allowance
      if (usdValueReceived > (usdValuePaid * 1.05)) {
        throw new Error(`Insufficient Payment: User paid $${usdValuePaid.toFixed(2)} but requested $${usdValueReceived.toFixed(2)} worth of tokens.`);
      }
    }

    // 4. CO-SIGN AND SUBMIT
    console.log(`[Brokerage] Transaction ID: ${tx.transactionId?.toString()}`);
    console.log("[Brokerage] Transaction validated. Treasury co-signing...");
    
    // Use explicit sign to avoid multi-node signature conflicts
    const signedTx = await tx.sign(treasuryKey);
    const response = await signedTx.execute(client);
    const receipt = await response.getReceipt(client);

    return NextResponse.json({ 
      success: true, 
      txId: response.transactionId.toString(),
      status: receipt.status.toString(),
      executedRate: `1 HBAR = $${liveHbarUsd.toFixed(4)} USD`
    });

  } catch (error: any) {
    console.error("[Brokerage API Error]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
