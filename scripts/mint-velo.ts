import {
    Client,
    PrivateKey,
    TokenMintTransaction,
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

    const tokenId = "0.0.8725045";
    // We minted 10 tokens initially (1,000,000,000 tiny tokens / 10^8 decimals = 10 whole tokens)
    // Goal: 1,000,000,000 whole tokens
    // Need: 999,999,990 more whole tokens
    // Tiny tokens to mint: 999,999,990 * 10^8 = 99,999,999,000,000,000 tiny tokens
    const amountToMint = BigInt("99999999000000000");

    console.log(`[Mint] Starting supply correction for VELO (${tokenId})...`);
    console.log(`[Mint] Target: Add 999,999,990 whole tokens (99.9 Quadrillion tiny tokens)`);

    try {
        // Create the mint transaction
        const transaction = new TokenMintTransaction()
            .setTokenId(tokenId)
            .setAmount(amountToMint)
            .freezeWith(client);

        // Sign with the supply key (which is the same as operator key for this token)
        const signTx = await transaction.sign(privateKey);
        const txResponse = await signTx.execute(client);

        // Get receipt to confirm success
        const receipt = await txResponse.getReceipt(client);
        
        console.log(`\n==========================================`);
        console.log(`✅ SUCCESS: VELO Supply Corrected!`);
        console.log(`New Total Supply: 1,000,000,000.00 VELO`);
        console.log(`Transaction Status: ${receipt.status.toString()}`);
        console.log(`==========================================\n`);

        process.exit(0);
    } catch (error) {
        console.error(`\n❌ MINTING FAILED:`, error);
        process.exit(1);
    }
}

main();
