/**
 * Deploy VeloStakingVault (non-custodial HBAR staking) to Hedera mainnet.
 * Signs with MAINNET_TREASURY_KEY from .env.local (deployer only — the
 * contract has no owner).
 *
 * Usage: node scripts/deploy-staking-vault.cjs
 */
const solc = require("solc");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const RPC_URL = "https://mainnet.hashio.io/api";

function loadEnvKey(name) {
  const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  for (const line of env.split(/\r?\n/)) {
    if (line.startsWith(name + "=")) return line.slice(name.length + 1).trim().replace(/"/g, "");
  }
  throw new Error(`${name} not found in .env.local`);
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "src", "contracts", "VeloStakingVault.sol"), "utf8");

  const input = {
    language: "Solidity",
    sources: { "VeloStakingVault.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"] } },
    },
  };

  console.log("Compiling with solc", solc.version());
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter((e) => e.severity === "error");
  if (errors.length) {
    errors.forEach((e) => console.error(e.formattedMessage));
    process.exit(1);
  }

  const artifact = output.contracts["VeloStakingVault.sol"]["VeloStakingVault"];

  let key = loadEnvKey("MAINNET_TREASURY_KEY");
  if (!key.startsWith("0x")) key = "0x" + key;
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(key, provider);
  console.log("Deploying from:", wallet.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(wallet.address)), "HBAR");

  const factory = new ethers.ContractFactory(artifact.abi, artifact.evm.bytecode.object, wallet);
  const contract = await factory.deploy({ gasLimit: 1500000 });
  console.log("Deploy tx:", contract.deploymentTransaction().hash);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("VeloStakingVault deployed to:", address);
  console.log("totalStaked:", (await contract.totalStaked()).toString());
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
