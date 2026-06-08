import {
  Client,
  AccountId,
  PrivateKey,
  TokenId,
  AccountAllowanceApproveTransaction,
  Hbar
} from "@hiero-ledger/sdk";
import * as dotenv from "dotenv";

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

async function main() {
  console.log("Setting up Hedera Client with Treasury Account...");

  const treasuryId = process.env.TREASURY_ID;
  const treasuryKeyStr = process.env.TREASURY_KEY;

  if (!treasuryId || !treasuryKeyStr) {
    throw new Error("TREASURY_ID or TREASURY_KEY is missing from .env.local");
  }

  const cleanKey = treasuryKeyStr.startsWith("0x") ? treasuryKeyStr.slice(2) : treasuryKeyStr;
  let treasuryKey: PrivateKey;
  try {
    treasuryKey = PrivateKey.fromStringECDSA(cleanKey);
  } catch (e) {
    treasuryKey = PrivateKey.fromStringED25519(cleanKey);
  }

  const client = Client.forTestnet();
  client.setOperator(treasuryId, treasuryKey);

  // The new decentralized Smart Contract Router ID
  const ROUTER_CONTRACT_ID = "0.0.9167775";

  // All HTS tokens supported by Velo swap
  const TOKEN_IDS = [
    { symbol: "VELO",  id: "0.0.8725045" },
    { symbol: "USDC",  id: "0.0.8735221" }, // ✅ Correct USDC
    { symbol: "USDT",  id: "0.0.8734118" },
    { symbol: "SAUCE", id: "0.0.8735149" },
    { symbol: "BONZO", id: "0.0.8735150" },
    { symbol: "PACK",  id: "0.0.8735151" },
    { symbol: "WHBAR", id: "0.0.8735222" },
  ];

  console.log(`Approving Router Contract (${ROUTER_CONTRACT_ID}) to spend ALL Treasury Tokens...`);

  // Max allowance to prevent having to re-approve
  const MAX_ALLOWANCE = 100_000_000_000_000;

  let allowanceTx = new AccountAllowanceApproveTransaction();
  for (const token of TOKEN_IDS) {
    console.log(`  - Approving ${token.symbol} (${token.id})`);
    allowanceTx = allowanceTx.approveTokenAllowance(
      TokenId.fromString(token.id),
      AccountId.fromString(treasuryId),
      AccountId.fromString(ROUTER_CONTRACT_ID),
      MAX_ALLOWANCE
    );
  }

  console.log("Executing approvals one token at a time to avoid fee issues...");

  for (const token of TOKEN_IDS) {
    try {
      const singleTx = new AccountAllowanceApproveTransaction()
        .approveTokenAllowance(
          TokenId.fromString(token.id),
          AccountId.fromString(treasuryId),
          AccountId.fromString(ROUTER_CONTRACT_ID),
          MAX_ALLOWANCE
        )
        .setMaxTransactionFee(new Hbar(2)); // Ensure adequate fee per approval

      const txResponse = await singleTx.execute(client);
      const receipt = await txResponse.getReceipt(client);
      console.log(`  ✅ ${token.symbol}: ${receipt.status.toString()}`);
    } catch (err: any) {
      console.error(`  ❌ ${token.symbol} FAILED:`, err.message || err);
    }
  }

  console.log(`\n✅ All approvals complete!`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to approve router:", err);
  process.exit(1);
});
