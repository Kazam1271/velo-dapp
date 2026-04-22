/**
 * Fetches token price information from DEX Screener for multiple tokens.
 * Open API that doesn't require an x-api-key for basic price data.
 */
export interface DexScreenerTokenResponse {
  schemaVersion: string;
  pairs: Array<{
    chainId: string;
    dexId: string;
    baseToken: {
      address: string;
      symbol: string;
    };
    priceUsd: string;
  }>;
}

/**
 * Fetches the latest USD prices for a list of token IDs (Hedera addresses).
 * Returns a map of TokenID -> priceUsd (number)
 */
export async function getBulkDexPrices(tokenIds: string[]): Promise<Record<string, number>> {
  if (tokenIds.length === 0) return {};
  
  try {
    const addresses = tokenIds.join(',');
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addresses}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 } // Cache for 60s
    });

    if (!response.ok) {
      console.error("[DexScreener] API error:", response.status);
      return {};
    }

    const data: DexScreenerTokenResponse = await response.json();
    const priceMap: Record<string, number> = {};

    // Map each token's first pair price
    if (data.pairs) {
      data.pairs.forEach((pair) => {
        // We only care about the base token's address in our mapping
        const addr = pair.baseToken.address;
        if (!priceMap[addr]) {
          priceMap[addr] = parseFloat(pair.priceUsd);
        }
      });
    }

    return priceMap;
  } catch (error) {
    console.error("[DexScreener] Failed to fetch bulk prices:", error);
    return {};
  }
}
