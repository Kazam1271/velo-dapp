import { Client, PrivateKey } from "@hiero-ledger/sdk";

/**
 * Singleton Hedera Client initialized with the Velo Treasury Engine credentials.
 * Used for automated airdrops and administrative network tasks.
 */
let cachedClient: Client | null = null;

export function getTreasuryClient(): Client {
  if (cachedClient) return cachedClient;

  const accountId = process.env.TREASURY_ID;
  const privateKeyStr = process.env.TREASURY_KEY;

  if (!accountId || !privateKeyStr) {
    throw new Error("TREASURY_ID and TREASURY_KEY must be set in environment variables");
  }

  const cleanKey = privateKeyStr.startsWith("0x") ? privateKeyStr.slice(2) : privateKeyStr;
  const privateKey = PrivateKey.fromStringECDSA(cleanKey);

  const client = Client.forTestnet();
  client.setOperator(accountId, privateKey);

  cachedClient = client;
  return client;
}
