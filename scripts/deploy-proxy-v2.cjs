/**
 * Deploy the fixed VeloMainnetProxy (router deadline + WHBAR contract/token split).
 * Signs with MAINNET_TREASURY_KEY from .env.local; updates .env.local on success.
 *
 * Usage: node scripts/deploy-proxy-v2.cjs
 */
const solc = require("solc");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const RPC_URL = "https://mainnet.hashio.io/api";
const SAUCERSWAP_ROUTER = "0x00000000000000000000000000000000003c437a"; // 0.0.3949434
const WHBAR_CONTRACT = "0x0000000000000000000000000000000000163b59";    // 0.0.1456985 (deposit/withdraw)
const WHBAR_TOKEN = "0x0000000000000000000000000000000000163b5a";       // 0.0.1456986 (HTS token)

function loadEnvKey(name) {
  const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  for (const line of env.split(/\r?\n/)) {
    if (line.startsWith(name + "=")) return line.slice(name.length + 1).trim().replace(/"/g, "");
  }
  throw new Error(`${name} not found in .env.local`);
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "src", "contracts", "VeloMainnetProxy.sol"), "utf8");

  const input = {
    language: "Solidity",
    sources: { "VeloMainnetProxy.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"] } },
    },
  };

  function findImports(importPath) {
    try {
      if (importPath.startsWith("@openzeppelin")) {
        return { contents: fs.readFileSync(path.resolve(root, "node_modules", importPath), "utf8") };
      }
      return { error: "File not found" };
    } catch (e) {
      return { error: e.message };
    }
  }

  console.log("Compiling with solc", solc.version());
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  const errors = (output.errors || []).filter((e) => e.severity === "error");
  if (errors.length) {
    errors.forEach((e) => console.error(e.formattedMessage));
    process.exit(1);
  }
  (output.errors || []).forEach((e) => console.warn(e.formattedMessage));

  const artifact = output.contracts["VeloMainnetProxy.sol"]["VeloMainnetProxy"];

  let key = loadEnvKey("MAINNET_TREASURY_KEY");
  if (!key.startsWith("0x")) key = "0x" + key;
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(key, provider);
  console.log("Deploying from:", wallet.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(wallet.address)), "HBAR");

  const factory = new ethers.ContractFactory(artifact.abi, artifact.evm.bytecode.object, wallet);
  const contract = await factory.deploy(SAUCERSWAP_ROUTER, WHBAR_CONTRACT, WHBAR_TOKEN, wallet.address, {
    gasLimit: 4000000,
  });
  console.log("Deploy tx:", contract.deploymentTransaction().hash);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("VeloMainnetProxy (fixed) deployed to:", address);

  // Sanity reads
  const fee = await contract.feeBasisPoints();
  const router = await contract.saucerSwapRouter();
  const wc = await contract.whbarContract();
  const wt = await contract.whbarToken();
  console.log("feeBasisPoints:", fee.toString());
  console.log("router:", router, "| whbarContract:", wc, "| whbarToken:", wt);

  // Update .env.local
  const envPath = path.join(root, ".env.local");
  let envContent = fs.readFileSync(envPath, "utf8");
  envContent = envContent.replace(
    /NEXT_PUBLIC_VELO_PROXY_ADDRESS=.*/,
    `NEXT_PUBLIC_VELO_PROXY_ADDRESS="${address}"`
  );
  fs.writeFileSync(envPath, envContent);
  console.log("Updated .env.local");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
