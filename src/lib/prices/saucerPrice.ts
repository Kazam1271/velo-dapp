import { TOKEN_LIST } from "@/config/tokens";

export interface SaucerPriceNode {
  id: string; // Token ID
  symbol: string;
  priceUsd: number;
}

/**
 * Fetches the live USD price feed from the SaucerSwap API.
 * Maps the data by Token ID to support our internal `tokens.ts` list.
 */
export async function getSaucerPrices(): Promise<Record<string, number>> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (process.env.SAUCERSWAP_API_KEY) {
      headers["x-api-key"] = process.env.SAUCERSWAP_API_KEY;
    }

    const response = await fetch("https://api.saucerswap.finance/tokens", {
      headers,
      next: { revalidate: 60 }, // optionally cache if used in RSC, but this is a hook mostly
    });

    if (!response.ok) {
      console.error("[SaucerPrice] API returned error:", response.status);
      return {};
    }

    const data: SaucerPriceNode[] = await response.json();
    const priceMap: Record<string, number> = {};

    data.forEach((token) => {
      // API uses string like "0.0.731861"
      priceMap[token.id] = token.priceUsd;
    });

    return priceMap;
  } catch (error) {
    console.error("[SaucerPrice] Failed to fetch token prices:", error);
    return {};
  }
}
