// Shared helpers for the native HashPack (ED25519-compatible) signing path.
//
// IMPORTANT: everything that touches hashconnect must use @hashgraph/sdk
// (the exact SDK hashconnect 3.0.14 bundles), NOT @hiero-ledger/sdk — mixing
// SDKs across freezeWithSigner/executeWithSigner makes HashPack fail with
// "Cannot read properties of undefined (reading 'execute')".
import { AccountId } from "@hashgraph/sdk";

const MIRROR = "https://mainnet-public.mirrornode.hedera.com/api/v1";

/**
 * Live mainnet consensus node ids (mirror node). Native transactions must be
 * pinned to CURRENT nodes: hashconnect's bundled SDK (2.41, early 2024) has a
 * stale address book with nodes that no longer exist, and HashPack crashes
 * ("reading 'execute'") on transactions frozen for a dead node — so never use
 * freezeWithSigner (whose populateTransaction picks stale nodes); set these
 * explicitly, set a TransactionId, and call .freeze() instead.
 */
let cachedNodeIds: AccountId[] | null = null;
export async function fetchLiveNodeAccountIds(): Promise<AccountId[]> {
  if (cachedNodeIds) return cachedNodeIds;
  try {
    const res = await fetch(`${MIRROR}/network/nodes?limit=50`);
    const out = await res.json();
    const ids = (out.nodes || []).map((n: any) => String(n.node_account_id)).slice(0, 10);
    if (ids.length) cachedNodeIds = ids.map((id: string) => AccountId.fromString(id));
  } catch { }
  // Fallback: nodes verified live on mainnet as of 2026-07.
  return cachedNodeIds || ["0.0.3", "0.0.4", "0.0.7", "0.0.8", "0.0.9"].map((id) => AccountId.fromString(id));
}

/**
 * Resolve a native Hedera transaction id ("0.0.x@ssss.nnnn") to its EVM-style
 * 0x hash via the mirror node. The XP-sync routes key contract interactions by
 * that hash, so the native path needs it after signing. Polls for mirror lag.
 * Only works for CONTRACT transactions (plain crypto transfers have no EVM hash).
 */
export async function fetchEvmTxHash(txId: string): Promise<string | null> {
  const mirrorId = txId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(`${MIRROR}/contracts/results/${mirrorId}`);
      if (res.ok) {
        const out = await res.json();
        if (out?.hash) return out.hash;
      }
    } catch { }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

/** EVM alias of a native account (long-zero for ED25519) — for contract reads. */
export async function fetchAccountEvmAddress(accountId: string): Promise<string | null> {
  try {
    const res = await fetch(`${MIRROR}/accounts/${accountId}`);
    if (!res.ok) return null;
    return (await res.json()).evm_address || null;
  } catch {
    return null;
  }
}

/**
 * Resolve a recipient ("0.0.x" or 0x…) to a native Hedera account id for
 * TransferTransaction. Returns null when the address has no account yet.
 */
export async function resolveRecipientAccountId(idOrAddr: string): Promise<string | null> {
  const s = idOrAddr.trim();
  if (/^0\.0\.\d+$/.test(s)) return s;
  try {
    const res = await fetch(`${MIRROR}/accounts/${s}`);
    if (res.ok) {
      const account = (await res.json()).account;
      if (account) return account;
    }
  } catch { }
  return null;
}
