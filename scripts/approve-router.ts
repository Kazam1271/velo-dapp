import {
  Client,
  AccountId,
  PrivateKey,
  TokenId,
  AccountAllowanceApproveTransaction
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
  const ROUTER_CONTRACT_ID = "0.0.9167086";

  // Velo Mock Tokens
  const VELO_TOKEN_ID = "0.0.8725045";
  const USDC_TOKEN_ID = "0.0.8734118";

  console.log(`Approving Router Contract (${ROUTER_CONTRACT_ID}) to spend Treasury Tokens...`);

  // Max allowance to prevent having to re-approve
  const MAX_ALLOWANCE = 100_000_000_000_000;

  const allowanceTx = new AccountAllowanceApproveTransaction()
    .approveTokenAllowance(
      TokenId.fromString(VELO_TOKEN_ID),
      AccountId.fromString(treasuryId),
      AccountId.fromString(ROUTER_CONTRACT_ID),
      MAX_ALLOWANCE
    )
    .approveTokenAllowance(
      TokenId.fromString(USDC_TOKEN_ID),
      AccountId.fromString(treasuryId),
      AccountId.fromString(ROUTER_CONTRACT_ID),
      MAX_ALLOWANCE
    );

  console.log("Executing transaction...");
  const txResponse = await allowanceTx.execute(client);
  const receipt = await txResponse.getReceipt(client);

  console.log(`\n✅ SUCCESS! Treasury has approved the Router Contract!`);
  console.log(`Status: ${receipt.status.toString()}`);
  
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to approve router:", err);
  process.exit(1);
});
