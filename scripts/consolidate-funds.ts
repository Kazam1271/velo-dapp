import {
    Client,
    PrivateKey,
    TransferTransaction,
    Hbar,
    AccountId,
    AccountBalanceQuery
} from "@hiero-ledger/sdk";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SOURCE_ACCOUNTS = [
    // Batch 1
    { id: "0.0.8812010", key: "0xff031d73f443157b3b1d4807af43fcdb88a7db97451cddf6caf6b68ed93f5b50" },
    { id: "0.0.8812023", key: "0x266467b669fedaa66870afbb6bc98fe22caf74482746eff3cd11a472d5804880" },
    { id: "0.0.8812024", key: "0x7f0caf0f167470f82c2803a3d834f2d24c5772953ab49cf009f1cba764eaa082" },
    { id: "0.0.8812037", key: "0x6e800b2cc70f907056e37f86a669ac555efb19288718467bb30c51b64e01aa0f" },
    { id: "0.0.8812083", key: "0xaf493c838640426330b0cf6fc6365b8fedb53b1803b6e7e6a295dd7c7d7281a9" },
    { id: "0.0.8812095", key: "0xc57914865f54931a9f26cd9977a148a9facffaae81f85003a4fcbe31b7272bc1" },
    { id: "0.0.8812039", key: "0x69c26d38ffd6089dce737d43150760fc439763ae7f435d5afd5f29e2759c85fa" },
    { id: "0.0.8812084", key: "0x2fbb545158a4a4d0c975b2e2bac948c4b94eff24ce211b91be17a8f058da9410" },
    // Batch 2
    { id: "0.0.8752628", key: "0xc98a40a0c634c5967db5d776423345f21e526b92811bec116230b1d416490926" },
    { id: "0.0.8642991", key: "0xa05b1fbf37fc370935a1227b332cb97fa632714a007f74591af57ad2ff864cea" },
    { id: "0.0.8642997", key: "0xe25715ee90e23061c806d71564b27197f5cc2de0018d574a7a0812e8a0616b36" }
];

async function main() {
    const treasuryId = process.env.TREASURY_ID || "0.0.8642596";
    const treasuryKey = process.env.TREASURY_KEY;
    
    if (!treasuryId || !treasuryKey) {
        console.error("❌ ERROR: TREASURY_ID or TREASURY_KEY not found in environment variables");
        process.exit(1);
    }

    console.log(`[Consolidation] Target Treasury: ${treasuryId}`);
    console.log(`[Consolidation] Draining ${SOURCE_ACCOUNTS.length} accounts...\n`);

    const client = Client.forTestnet();

    // Set operator to Treasury so Treasury pays the transaction fees
    const cleanTreasuryKey = treasuryKey.startsWith("0x") ? treasuryKey.slice(2) : treasuryKey;
    let treasuryPrivateKey;
    try {
        treasuryPrivateKey = PrivateKey.fromStringECDSA(cleanTreasuryKey);
    } catch (e) {
        treasuryPrivateKey = PrivateKey.fromStringED25519(cleanTreasuryKey);
    }
    client.setOperator(treasuryId, treasuryPrivateKey);

    for (const source of SOURCE_ACCOUNTS) {
        try {
            console.log(`[${source.id}] Querying balance...`);
            
            // Query current balance of source account
            const balance = await new AccountBalanceQuery()
                .setAccountId(source.id)
                .execute(client);
            
            const balanceHbar = parseFloat(balance.hbars.toTinybars().toString()) / 100000000;
            console.log(`[${source.id}] Balance is ${balanceHbar} HBAR.`);
            
            if (balanceHbar <= 0) {
                console.log(`[${source.id}] Skipping because balance is 0.`);
                continue;
            }

            const cleanKey = source.key.startsWith("0x") ? source.key.slice(2) : source.key;
            let privateKey;
            try {
                privateKey = PrivateKey.fromStringECDSA(cleanKey);
            } catch (e) {
                privateKey = PrivateKey.fromStringED25519(cleanKey);
            }

            console.log(`[${source.id}] Initializing full transfer of ${balanceHbar} HBAR...`);

            // Transfer ALL hbars from source to treasury
            const transaction = new TransferTransaction()
                .addHbarTransfer(source.id, new Hbar(-balanceHbar))
                .addHbarTransfer(treasuryId, new Hbar(balanceHbar))
                .freezeWith(client);

            // Sign the transaction with the sender's private key
            const signTx = await transaction.sign(privateKey);
            
            // Execute using the client (which has Treasury as operator/payer)
            const txResponse = await signTx.execute(client);
            const receipt = await txResponse.getReceipt(client);

            console.log(`✅ SUCCESS: Moved ${balance.hbars.toString()} from ${source.id} to Treasury.`);
        } catch (error: any) {
            console.error(`❌ FAILED for ${source.id}:`, error.message || error);
        }
    }

    console.log("\n[Consolidation] Mission Complete.");
    process.exit(0);
}

main();
