/**
 * Owner-only: withdraw accumulated protocol fees from a Velo proxy to the
 * owner wallet. Signs with MAINNET_TREASURY_KEY from .env.local.
 *
 * Usage:
 *   node scripts/withdraw-fees.cjs                     # HBAR from current (v3) proxy
 *   node scripts/withdraw-fees.cjs hbar <proxyAddr>    # HBAR from a specific proxy
 *   node scripts/withdraw-fees.cjs <tokenEvmAddress>   # a token from current proxy
 *   node scripts/withdraw-fees.cjs <tokenEvmAddress> <proxyAddr>
 *
 * Examples:
 *   node scripts/withdraw-fees.cjs hbar 0x00720C916038dd4F29f09940E289ede3D2D1D8E0   # old v2 HBAR
 *   node scripts/withdraw-fees.cjs 0x00000000000000000000000000000000000b2ad5        # SAUCE from v3
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC_URL = "https://mainnet.hashio.io/api";
const DEFAULT_PROXY = "0x00aE201cD833eD38639DCd9eF9b21ebd47f898Da"; // v3
const ABI = [
  "function owner() view returns (address)",
  "function withdrawHBAR()",
  "function withdrawFees(address _token)",
];

function loadEnvKey(name) {
  const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  for (const line of env.split(/\r?\n/)) {
    if (line.startsWith(name + "=")) return line.slice(name.length + 1).trim().replace(/"/g, "");
  }
  throw new Error(`${name} not found in .env.local`);
}

async function main() {
  const what = (process.argv[2] || "hbar").toLowerCase();
  const proxyAddr = process.argv[3] || DEFAULT_PROXY;

  let key = loadEnvKey("MAINNET_TREASURY_KEY");
  if (!key.startsWith("0x")) key = "0x" + key;
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(key, provider);
  const proxy = new ethers.Contract(proxyAddr, ABI, wallet);

  const owner = await proxy.owner();
  console.log("Proxy :", proxyAddr);
  console.log("Signer:", wallet.address, "| Owner:", owner);
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error("Signer is not the contract owner — aborting.");
  }

  let tx;
  if (what === "hbar") {
    console.log("Withdrawing HBAR fees to owner...");
    tx = await proxy.withdrawHBAR({ gasLimit: 150000 });
  } else {
    console.log(`Withdrawing token fees (${what}) to owner...`);
    tx = await proxy.withdrawFees(what, { gasLimit: 400000 });
  }
  console.log("Tx sent:", tx.hash);
  await tx.wait();
  console.log("Done ✓ — funds sent to", owner);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
