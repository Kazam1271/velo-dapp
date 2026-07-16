/**
 * Verify VeloStakingVault source on Sourcify/HashScan (Hedera mainnet).
 * Usage: node scripts/verify-vault.cjs [address]
 */
const solc = require("solc");
const fs = require("fs");
const path = require("path");

const ADDRESS = process.argv[2] || "0x58525E513a4e4F4Dd732804C2AF42096091dC9eb";
const CHAIN_ID = "295";
const SOURCIFY = "https://sourcify.dev/server";

function stripCbor(hex) {
  const len = parseInt(hex.slice(-4), 16);
  return hex.slice(0, -4 - len * 2);
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "src", "contracts", "VeloStakingVault.sol"), "utf8");
  const longVersion = solc.version().replace(/\.Emscripten\.clang$/, "");
  console.log("solc:", solc.version());

  const input = {
    language: "Solidity",
    sources: { "VeloStakingVault.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"] } },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter((e) => e.severity === "error");
  if (errors.length) { errors.forEach((e) => console.error(e.formattedMessage)); process.exit(1); }
  const artifact = output.contracts["VeloStakingVault.sol"]["VeloStakingVault"];

  const res = await fetch(`https://mainnet-public.mirrornode.hedera.com/api/v1/contracts/${ADDRESS}`);
  const info = await res.json();
  const deployed = (info.runtime_bytecode || "").replace(/^0x/, "");
  const compiled = artifact.evm.deployedBytecode.object.replace(/^0x/, "");
  const match = stripCbor(compiled) === stripCbor(deployed);
  console.log("bytecode match:", match ? "YES ✓" : "NO ✗");
  if (!match) process.exit(1);

  const submit = await fetch(`${SOURCIFY}/v2/verify/${CHAIN_ID}/${ADDRESS}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stdJsonInput: input,
      compilerVersion: longVersion,
      contractIdentifier: "VeloStakingVault.sol:VeloStakingVault",
    }),
  });
  const result = await submit.json().catch(() => null);
  console.log("HTTP", submit.status, JSON.stringify(result));

  const jobId = result && result.verificationId;
  if (jobId) {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const st = await (await fetch(`${SOURCIFY}/v2/verify/${jobId}`)).json().catch(() => null);
      if (st && st.isJobCompleted) {
        console.log("Verification:", JSON.stringify(st.contract));
        break;
      }
    }
  }
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
