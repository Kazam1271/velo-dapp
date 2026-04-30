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
    { id: "0.0.8752628", key: "0xc98a40a0c634c5967db5d776423345f21e526b92811bec116230b1d416490926" },
    { id: "0.0.8642991", key: "0xa05b1fbf37fc370935a1227b332cb97fa632714a007f74591af57ad2ff864cea" },
    { id: "0.0.8642997", key: "0xe25715ee90e23061c806d71564b27197f5cc2de0018d574a7a0812e8a0616b36" }
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
