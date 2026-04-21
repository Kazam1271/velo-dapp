const MIRROR_NODE_BASE = "https://testnet.mirrornode.hedera.com/api/v1";

export interface HederaAccountInfo {
  /** Native account ID, e.g. "0.0.12345" */
  accountId: string | null;
  /** True when the account exists on chain but has no associated key yet (hollow account) */
  isHollow: boolean;
  evmAddress: string;
}

/**
 * Given an EVM-style 0x address, resolves the native Hedera account ID
 * (0.0.x) using the Hedera Testnet Mirror Node REST API.
 *
 * Returns null for both fields if the account has not yet been created
 * on the Hedera network.
 */
export async function getNativeAccountId(evmAddress: string): Promise<HederaAccountInfo> {
  const normalised = evmAddress.toLowerCase();
  const url = `${MIRROR_NODE_BASE}/accounts/${normalised}`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      // Mirror Node is a public read-only API; no auth needed
      cache: "no-store",
    });

    if (!response.ok) {
      // 404 = account not yet active on Hedera (hollow / not funded)
      if (response.status === 404) {
        return { accountId: null, isHollow: true, evmAddress };
      }
      throw new Error(`Mirror Node error: ${response.status}`);
    }

    const data = await response.json();

    /*
     * The Mirror Node response contains an `account` field ("0.0.x"),
     * and optionally `alias` / `key` fields. A "hollow" account is one
     * that has an EVM address but whose `key` object is null — i.e. the
     * private key is unknown to the Hedera network until a first HBAR tx.
     */
    const accountId: string | null = data?.account ?? null;
    const isHollow: boolean =
      !data?.key ||
      data?.key?.key === null ||
      data?.key?.key === "" ||
      data?.key?.type === "ECDSA_SECP256K1" && data?.key?.key === null;

    return { accountId, isHollow, evmAddress };
  } catch (err) {
    console.error("Mirror Node lookup failed:", err);
    return { accountId: null, isHollow: false, evmAddress };
  }
}
