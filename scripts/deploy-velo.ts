import {
    Client,
    PrivateKey,
    TokenCreateTransaction,
    TokenType,
    TokenSupplyType,
    Hbar,
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
    
    // Ensure the key is clean hex (removing 0x if present)
    const cleanKey = operatorKey.startsWith("0x") ? operatorKey.slice(2) : operatorKey;
    const privateKey = PrivateKey.fromStringECDSA(cleanKey);
    
    client.setOperator(operatorId, privateKey);

    console.log(`[Deploy] Initializing deployment for 'Velo' token...`);
    console.log(`[Deploy] Operator: ${operatorId}`);

    try {
        // Create the token transaction
        const transaction = new TokenCreateTransaction()
            .setTokenName("Velo")
            .setTokenSymbol("VELO")
            .setTokenType(TokenType.FungibleCommon)
            .setDecimals(8)
            .setInitialSupply(1000000000) 
            .setTreasuryAccountId(operatorId)
            .setAdminKey(privateKey)
            .setSupplyKey(privateKey)
            .setSupplyType(TokenSupplyType.Infinite)
            .freezeWith(client);

        // Sign and execute
        const signTx = await transaction.sign(privateKey);
        const txResponse = await signTx.execute(client);

        // Get receipt
        const receipt = await txResponse.getReceipt(client);
        const tokenId = receipt.tokenId;

        console.log(`\n==========================================`);
        console.log(`✅ SUCCESS: Velo Token Deployed!`);
        console.log(`TOKEN ID: ${tokenId?.toString()}`);
        console.log(`==========================================\n`);

        process.exit(0);
    } catch (error) {
        console.error(`\n❌ DEPLOYMENT FAILED:`, error);
        process.exit(1);
    }
}

main();
