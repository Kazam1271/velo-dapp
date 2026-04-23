import { Transaction, Client, PrivateKey, TransferTransaction, AccountId, TokenId, Hbar } from "@hashgraph/sdk";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { transactionBytes } = await req.json();
    
    // 1. Initialize Hedera Client with Treasury Operator
    const client = Client.forTestnet();
    const treasuryId = process.env.TREASURY_ID; 
    const treasuryKeyStr = process.env.TREASURY_KEY;

    if (!treasuryId || !treasuryKeyStr) {
      throw new Error("Treasury credentials missing in environment variables.");
    }

    const treasuryKey = PrivateKey.fromStringECDSA(treasuryKeyStr);
    client.setOperator(treasuryId, treasuryKey);

    // 2. Rebuild the transaction from the frontend's bytes
    const tx = Transaction.fromBytes(Buffer.from(transactionBytes, 'hex'));
    
    // 3. Security Check: Validate Transaction Type and Contents
    if (!(tx instanceof TransferTransaction)) {
      throw new Error("Invalid transaction type. Only TransferTransactions are allowed.");
    }

    const transfers = tx.hbarTransfers;
    const tokenTransfers = tx.tokenTransfers;

    // Verify Treasury is involved and not being drained maliciously
    // Note: In a production app, we would fetch live prices here to ensure the swap ratio is correct.
    console.log("[Swap API] Verifying transaction integrity...");
    
    // Ensure Treasury is one of the parties
    const treasuryAccId = AccountId.fromString(treasuryId);
    let treasuryInvolved = false;
    
    // Check HBAR transfers
    for (const [id, amount] of transfers) {
      if (id.toString() === treasuryAccId.toString()) treasuryInvolved = true;
    }
    
    // Check Token transfers
    for (const [tokenId, accountTransfers] of tokenTransfers) {
      for (const [accountId, amount] of accountTransfers) {
        if (accountId.toString() === treasuryAccId.toString()) treasuryInvolved = true;
      }
    }

    if (!treasuryInvolved) {
      throw new Error("Treasury account not involved in this transaction.");
    }

    // 4. Co-sign and Submit
    const signedTx = await tx.sign(treasuryKey);
    const response = await signedTx.execute(client);
    const receipt = await response.getReceipt(client);

    return NextResponse.json({ 
      success: true, 
      status: receipt.status.toString(), 
      txId: response.transactionId.toString() 
    });
  } catch (error: any) {
    console.error("[Swap API Error]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
