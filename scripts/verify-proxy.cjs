/**
 * Verify VeloMainnetProxy source on HashScan (Hedera Sourcify instance).
 *
 * 1. Recompiles src/contracts/VeloMainnetProxy.sol with the same settings the
 *    deploy script used (solc 0.8.35, optimizer on, 200 runs).
 * 2. Confirms the compiled runtime bytecode matches what's deployed at the
 *    proxy address (ignoring the trailing CBOR metadata blob).
 * 3. Submits sources + metadata to https://server-verify.hashscan.io.
 *
 * Usage: node scripts/verify-proxy.cjs
 */
const solc = require("solc");
const fs = require("fs");
const path = require("path");

// Defaults to the current proxy; pass a different address + solc release as
// argv to verify older deployments: node scripts/verify-proxy.cjs <address> <solcVersion>
const ADDRESS = process.argv[2] || "0x00aE201cD833eD38639DCd9eF9b21ebd47f898Da";
const SOLC_RELEASE = process.argv[3] || "0.8.36";
const CHAIN_ID = "295"; // Hedera mainnet
const SOURCIFY = "https://sourcify.dev/server";

function stripCbor(hex) {
  const len = parseInt(hex.slice(-4), 16);
  return hex.slice(0, -4 - len * 2);
}

function loadSolc(versionTag) {
  return new Promise((resolve, reject) => {
    solc.loadRemoteVersion(versionTag, (err, solcSpecific) => {
      if (err) reject(err);
      else resolve(solcSpecific);
    });
  });
}

async function main() {
  // Load the exact solc release that produced the deployed bytecode (its CBOR
  // metadata tail names the version). Uses the local solc if versions match.
  let compiler = solc;
  if (!solc.version().startsWith(SOLC_RELEASE + "+")) {
    const list = await (await fetch("https://binaries.soliditylang.org/bin/list.json")).json();
    const tag = list.releases[SOLC_RELEASE].replace(/^soljson-/, "").replace(/\.js$/, "");
    console.log("Loading remote compiler:", tag);
    compiler = await loadSolc(tag);
  }
  const longVersion = compiler.version().replace(/\.Emscripten\.clang$/, "");
  console.log("solc version:", compiler.version());

  const root = path.resolve(__dirname, "..");
  const mainSource = fs.readFileSync(path.join(root, "src", "contracts", "VeloMainnetProxy.sol"), "utf8");

  const input = {
    language: "Solidity",
    sources: { "VeloMainnetProxy.sol": { content: mainSource } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"] } },
    },
  };

  const resolved = {};
  function findImports(importPath) {
    try {
      if (importPath.startsWith("@openzeppelin")) {
        const full = path.resolve(root, "node_modules", importPath);
        const contents = fs.readFileSync(full, "utf8");
        resolved[importPath] = contents;
        return { contents };
      }
      return { error: "File not found" };
    } catch (e) {
      return { error: e.message };
    }
  }

  console.log("Compiling...");
  const output = JSON.parse(compiler.compile(JSON.stringify(input), { import: findImports }));
  const errors = (output.errors || []).filter((e) => e.severity === "error");
  if (errors.length) {
    errors.forEach((e) => console.error(e.formattedMessage));
    process.exit(1);
  }

  const artifact = output.contracts["VeloMainnetProxy.sol"]["VeloMainnetProxy"];
  const compiledRuntime = artifact.evm.deployedBytecode.object.replace(/^0x/, "");
  const metadata = artifact.metadata;

  // Compare against the deployed runtime bytecode
  const res = await fetch(`https://mainnet-public.mirrornode.hedera.com/api/v1/contracts/${ADDRESS}`);
  const info = await res.json();
  const deployedRuntime = (info.runtime_bytecode || "").replace(/^0x/, "");

  // Immutable variables (saucerSwapRouter, whbar) are embedded in the on-chain
  // runtime at deploy time but are zero-placeholders in local compiler output —
  // mask those regions on both sides before comparing.
  function maskImmutables(hex) {
    const chars = hex.split("");
    const refs = artifact.evm.deployedBytecode.immutableReferences || {};
    for (const slots of Object.values(refs)) {
      for (const { start, length } of slots) {
        for (let i = start * 2; i < (start + length) * 2 && i < chars.length; i++) chars[i] = "0";
      }
    }
    return chars.join("");
  }

  const a = stripCbor(maskImmutables(compiledRuntime));
  const b = stripCbor(maskImmutables(deployedRuntime));
  console.log("compiled runtime (sans metadata):", a.length, "chars");
  console.log("deployed runtime (sans metadata):", b.length, "chars");
  console.log("bytecode match:", a === b ? "YES ✓" : "NO ✗");
  if (a !== b) {
    console.error("Bytecode mismatch — sources/settings differ from what was deployed. Aborting.");
    process.exit(1);
  }

  // Submit via Sourcify API v2: full standard-JSON input with all sources inline.
  const fullInput = {
    language: "Solidity",
    sources: { "VeloMainnetProxy.sol": { content: mainSource } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"] } },
    },
  };
  for (const [p, contents] of Object.entries(resolved)) fullInput.sources[p] = { content: contents };

  console.log("Submitting to Sourcify v2 with sources:", Object.keys(fullInput.sources).join(", "));
  const submit = await fetch(`${SOURCIFY}/v2/verify/${CHAIN_ID}/${ADDRESS}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stdJsonInput: fullInput,
      compilerVersion: longVersion,
      contractIdentifier: "VeloMainnetProxy.sol:VeloMainnetProxy",
    }),
  });
  const result = await submit.json().catch(() => null);
  console.log("HTTP", submit.status, JSON.stringify(result, null, 2));

  const jobId = result && (result.verificationId || result.jobId);
  if (jobId) {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const st = await (await fetch(`${SOURCIFY}/v2/verify/${jobId}`)).json().catch(() => null);
      const done = st && !st.isJobCompleted === false;
      console.log("poll:", JSON.stringify(st));
      if (st && (st.isJobCompleted || st.status === "completed" || st.contract)) break;
    }
  }

  // Final status
  const check = await fetch(`${SOURCIFY}/v2/contract/${CHAIN_ID}/${ADDRESS}`);
  console.log("Final:", check.status, JSON.stringify(await check.json().catch(() => null)));
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
