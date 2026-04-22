import {
    Client,
    PrivateKey,
    TokenCreateTransaction,
    TokenType,
    TokenSupplyType,
} from "@hiero-ledger/sdk";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
    const operatorId = process.env.OPERATOR_ID;
    const operatorKey = process.env.OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
        throw new Error("OPERATOR_ID and OPERATOR_KEY must be set in .env.local");
    }

    // Initialize Hedera Client
    const client = Client.forTestnet();
    
    // Use ECDSA for the provided EVM-style key
    const cleanKey = operatorKey.startsWith("0x") ? operatorKey.slice(2) : operatorKey;
    const privateKey = PrivateKey.fromStringECDSA(cleanKey);
    
    client.setOperator(operatorId, privateKey);

    console.log(`[HTS] Starting creation of Tether USD (Mock)...`);

    try {
        // Create the token
        const transaction = new TokenCreateTransaction()
            .setTokenName("Tether USD (Mock)")
            .setTokenSymbol("USDT")
            .setTokenType(TokenType.FungibleCommon)
            .setDecimals(6)
            .setInitialSupply(1000000000000) // 1,000,000 * 10^6
            .setTreasuryAccountId(operatorId)
            .setAdminKey(privateKey)
            .setSupplyKey(privateKey)
            .setSupplyType(TokenSupplyType.Infinite)
            .freezeWith(client);

        // Sign with the admin key
        const signTx = await transaction.sign(privateKey);
        const txResponse = await signTx.execute(client);

        // Get receipt to get the new token ID
        const receipt = await txResponse.getReceipt(client);
        const tokenId = receipt.tokenId;

        if (!tokenId) {
            throw new Error("Failed to retrieve Token ID from receipt");
        }

        console.log(`\n==========================================`);
        console.log(`✅ SUCCESS: Mock USDT Created!`);
        console.log(`Token Name: Tether USD (Mock)`);
        console.log(`Token Symbol: USDT`);
        console.log(`Token ID: ${tokenId.toString()}`);
        console.log(`Decimals: 6`);
        console.log(`Initial Supply: 1,000,000.000000`);
        console.log(`Transaction Status: ${receipt.status.toString()}`);
        console.log(`==========================================\n`);

        process.exit(0);
    } catch (error) {
        console.error(`\n❌ TOKEN CREATION FAILED:`, error);
        process.exit(1);
    }
}

main();
