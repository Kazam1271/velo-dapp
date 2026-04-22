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

async function createToken(client: Client, privateKey: PrivateKey, operatorId: string, name: string, symbol: string) {
    console.log(`[HTS] Starting creation of ${name} (${symbol})...`);
    
    // Initial Supply: 1,000,000,000 scaled by 10^6
    const initialSupply = BigInt("1000000000000000"); // Using BigInt constructor for compatibility

    const transaction = new TokenCreateTransaction()
        .setTokenName(name)
        .setTokenSymbol(symbol)
        .setTokenType(TokenType.FungibleCommon)
        .setDecimals(6)
        .setInitialSupply(initialSupply)
        .setTreasuryAccountId(operatorId)
        .setAdminKey(privateKey)
        .setSupplyKey(privateKey)
        .setSupplyType(TokenSupplyType.Infinite)
        .freezeWith(client);

    const signTx = await transaction.sign(privateKey);
    const txResponse = await signTx.execute(client);
    const receipt = await txResponse.getReceipt(client);
    
    const tokenId = receipt.tokenId;
    if (!tokenId) {
        throw new Error(`Failed to retrieve Token ID for ${symbol}`);
    }

    return tokenId.toString();
}

async function main() {
    const operatorId = process.env.OPERATOR_ID;
    const operatorKey = process.env.OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
        throw new Error("OPERATOR_ID and OPERATOR_KEY must be set in .env.local");
    }

    const client = Client.forTestnet();
    const cleanKey = operatorKey.startsWith("0x") ? operatorKey.slice(2) : operatorKey;
    const privateKey = PrivateKey.fromStringECDSA(cleanKey);
    client.setOperator(operatorId, privateKey);

    const tokens = [
        { name: "SaucerSwap (Mock)", symbol: "SAUCE" },
        { name: "Bonzo Finance (Mock)", symbol: "BONZO" },
        { name: "Pack Token (Mock)", symbol: "PACK" }
    ];

    const results: { [key: string]: string } = {};

    try {
        for (const token of tokens) {
            const tokenId = await createToken(client, privateKey, operatorId, token.name, token.symbol);
            results[token.symbol] = tokenId;
        }

        console.log(`\n==========================================`);
        console.log(`✅ SUCCESS: All Mock Tokens Created!`);
        Object.entries(results).forEach(([symbol, id]) => {
            console.log(`${symbol}: ${id}`);
        });
        console.log(`==========================================\n`);

        process.exit(0);
    } catch (error) {
        console.error(`\n❌ MINTING FAILED:`, error);
        process.exit(1);
    }
}

main();
