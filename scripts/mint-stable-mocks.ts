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

async function createToken(client: Client, privateKey: PrivateKey, operatorId: string, name: string, symbol: string, decimals: number, supply: string) {
    console.log(`[HTS] Starting creation of ${name} (${symbol})...`);
    
    const initialSupply = BigInt(supply);

    const transaction = new TokenCreateTransaction()
        .setTokenName(name)
        .setTokenSymbol(symbol)
        .setTokenType(TokenType.FungibleCommon)
        .setDecimals(decimals)
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
        { 
            name: "USD Coin (Mock)", 
            symbol: "USDC", 
            decimals: 6, 
            supply: "1000000000000000" // 1,000,000,000 * 10^6
        },
        { 
            name: "Wrapped HBAR (Mock)", 
            symbol: "WHBAR", 
            decimals: 8, 
            supply: "100000000000000000" // 1,000,000,000 * 10^8
        }
    ];

    const results: { [key: string]: string } = {};

    try {
        for (const token of tokens) {
            const tokenId = await createToken(client, privateKey, operatorId, token.name, token.symbol, token.decimals, token.supply);
            results[token.symbol] = tokenId;
        }

        console.log(`\n==========================================`);
        console.log(`✅ SUCCESS: Final Mock Tokens Created!`);
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
