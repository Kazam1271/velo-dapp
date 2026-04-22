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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5s timeout

  try {
    console.log(`[MirrorNode] Resolving EVM address: ${normalised}`);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[MirrorNode] Account ${normalised} not yet created on Hedera (Hollow).`);
        return { accountId: null, isHollow: true, evmAddress };
      }
      console.error(`[MirrorNode] HTTP Error ${response.status} for ${normalised}`);
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

    console.log(`[MirrorNode] Successfully resolved ${normalised} to ${accountId} (isHollow: ${isHollow})`);
    return { accountId, isHollow, evmAddress };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      console.warn(`[MirrorNode] Resolution for ${normalised} timed out.`);
    } else {
      console.error(`[MirrorNode] Lookup failed for ${normalised}:`, err);
    }
    return { accountId: null, isHollow: false, evmAddress };
  }
}

/**
 * Fetches the current HBAR balance (in tinybars) for a native Hedera
 * account ID from the Testnet Mirror Node.
 */
export async function getAccountBalance(accountId: string): Promise<number> {
  const url = `${MIRROR_NODE_BASE}/accounts/${accountId}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Mirror Node error: ${response.status}`);
    }

    const data = await response.json();
    const tinybars = data?.balance?.balance ?? 0;
    
    console.log(`[MirrorNode] Fetched balance for ${accountId}: ${tinybars} tinybars`);
    return tinybars;
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error(`[MirrorNode] Balance fetch failed for ${accountId}:`, err);
    return 0;
  }
}
