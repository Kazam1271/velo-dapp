/**
 * Owner-only: update VeloMainnetProxy.feeBasisPoints on Hedera mainnet.
 *
 * Usage: node scripts/set-fee.cjs <newFeeBps>
 *   e.g. node scripts/set-fee.cjs 25   (= 0.25%)
 *
 * Signs with MAINNET_TREASURY_KEY from .env.local (must be the contract owner).
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC_URL = "https://mainnet.hashio.io/api";
const PROXY = "0x00aE201cD833eD38639DCd9eF9b21ebd47f898Da"; // v3 proxy (deployed 2026-07-15, token->HBAR support)
const ABI = [
  "function feeBasisPoints() view returns (uint256)",
  "function owner() view returns (address)",
  "function setFeeBasisPoints(uint256 _newFee)",
];

function loadEnvKey(name) {
  const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  for (const line of env.split(/\r?\n/)) {
    if (line.startsWith(name + "=")) {
      return line.slice(name.length + 1).trim().replace(/"/g, "");
    }
  }
  throw new Error(`${name} not found in .env.local`);
}

async function main() {
  const newFee = parseInt(process.argv[2], 10);
  if (isNaN(newFee) || newFee < 0 || newFee > 10000) {
    throw new Error("Pass the new fee in basis points, e.g. 25 for 0.25%");
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  let key = loadEnvKey("MAINNET_TREASURY_KEY");
  if (!key.startsWith("0x")) key = "0x" + key;
  const wallet = new ethers.Wallet(key, provider);
  const proxy = new ethers.Contract(PROXY, ABI, wallet);

  const owner = await proxy.owner();
  console.log("Signer:", wallet.address);
  console.log("Owner :", owner);
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error("Signer is not the contract owner — aborting.");
  }

  const before = await proxy.feeBasisPoints();
  console.log(`Current fee: ${before} bps`);
  if (Number(before) === newFee) {
    console.log("Fee is already set to that value — nothing to do.");
    return;
  }

  console.log(`Setting fee to ${newFee} bps (${newFee / 100}%)...`);
  const tx = await proxy.setFeeBasisPoints(newFee, { gasLimit: 150000 });
  console.log("Tx sent:", tx.hash);
  await tx.wait();

  const after = await proxy.feeBasisPoints();
  console.log(`New fee: ${after} bps ${Number(after) === newFee ? "✓" : "✗ MISMATCH"}`);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
