import {
    Client,
    PrivateKey,
    TransferTransaction,
    Hbar,
    AccountId
} from "@hiero-ledger/sdk";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SOURCE_ACCOUNTS = [
    { id: "0.0.8812010", key: "0xff031d73f443157b3b1d4807af43fcdb88a7db97451cddf6caf6b68ed93f5b50" },
    { id: "0.0.8812023", key: "0x266467b669fedaa66870afbb6bc98fe22caf74482746eff3cd11a472d5804880" },
    { id: "0.0.8812024", key: "0x7f0caf0f167470f82c2803a3d834f2d24c5772953ab49cf009f1cba764eaa082" },
    { id: "0.0.8812037", key: "0x6e800b2cc70f907056e37f86a669ac555efb19288718467bb30c51b64e01aa0f" },
    { id: "0.0.8812083", key: "0xaf493c838640426330b0cf6fc6365b8fedb53b1803b6e7e6a295dd7c7d7281a9" },
    { id: "0.0.8812095", key: "0xc57914865f54931a9f26cd9977a148a9facffaae81f85003a4fcbe31b7272bc1" },
    { id: "0.0.8812039", key: "0x69c26d38ffd6089dce737d43150760fc439763ae7f435d5afd5f29e2759c85fa" },
    { id: "0.0.8812084", key: "0x2fbb545158a4a4d0c975b2e2bac948c4b94eff24ce211b91be17a8f058da9410" }
];

async function main() {
    const treasuryId = "0.0.8642596";
    
    if (!treasuryId) {
        console.error("❌ ERROR: TREASURY_ID not found in .env.local");
        process.exit(1);
    }

    console.log(`[Consolidation] Target Treasury: ${treasuryId}`);
    console.log(`[Consolidation] Draining ${SOURCE_ACCOUNTS.length} accounts...\n`);

    const client = Client.forTestnet();

    for (const source of SOURCE_ACCOUNTS) {
        try {
            console.log(`[${source.id}] Initializing transfer...`);
            
            const cleanKey = source.key.startsWith("0x") ? source.key.slice(2) : source.key;
            let privateKey;
            try {
                privateKey = PrivateKey.fromStringECDSA(cleanKey);
            } catch (e) {
                privateKey = PrivateKey.fromStringED25519(cleanKey);
            }
            
            // Set operator to the source account so we can sign the transfer
            client.setOperator(source.id, privateKey);

            // Calculate transfer amount (1000 HBAR minus a small buffer for fees)
            const amount = 999.5; 

            const transaction = new TransferTransaction()
                .addHbarTransfer(source.id, new Hbar(-amount))
                .addHbarTransfer(treasuryId, new Hbar(amount))
                .freezeWith(client);

            const signTx = await transaction.sign(privateKey);
            const txResponse = await signTx.execute(client);
            const receipt = await txResponse.getReceipt(client);

            console.log(`✅ SUCCESS: Moved ${amount} HBAR from ${source.id} to Treasury.`);
        } catch (error) {
            console.error(`❌ FAILED for ${source.id}:`, error);
        }
    }

    console.log("\n[Consolidation] Mission Complete.");
    process.exit(0);
}

main();
