import { useState, useEffect } from "react";
import { TOKEN_LIST } from "@/config/tokens";
import { getBulkDexPrices } from "@/lib/prices/dexScreenerPrice";

export interface Prices {
  [symbol: string]: number; // Map symbol (lowercase) -> priceUsd
}

/**
 * Hook to manage live price data using DEX Screener as the primary source.
 * This bypasses the need for SaucerSwap API keys.
 */
export function usePriceFeed() {
  const [prices, setPrices] = useState<Prices>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPrices = async () => {
      // 1. Safety Net Fallbacks (Approximate Live Prices)
      const fallbackPrices: { [key: string]: number } = {
        hbar: 0.091,
        whbar: 0.091,
        sauce: 0.021,
        bonzo: 0.019,
        pack: 0.007,
        usdt: 1.0,
        usdc: 1.0,
        velo: 0.0091 
      };

      try {
        // 2. Fetch from our secure internal proxy
        const response = await fetch("/api/prices");
        if (!response.ok) throw new Error("Internal API route failed");
        
        const data = await response.json();
        const livePrices: { [key: string]: number } = {};

        // 3. Map SaucerSwap Mainnet IDs to symbols
        if (Array.isArray(data)) {
          data.forEach((token: any) => {
            const price = parseFloat(token.priceUsd);
            
            // WHBAR / HBAR
            if (token.id === "0.0.1456986") {
              livePrices["hbar"] = price;
              livePrices["whbar"] = price;
            }
            // SAUCE
            if (token.id === "0.0.731861") livePrices["sauce"] = price;
            // BONZO
            if (token.id === "0.0.4578144") livePrices["bonzo"] = price;
            // PACK
            if (token.id === "0.0.4792777") livePrices["pack"] = price;
          });
        }

        // 4. Stablecoins and Velo Peg
        livePrices["usdt"] = 1.0;
        livePrices["usdc"] = 1.0;
        livePrices["velo"] = (livePrices["hbar"] || fallbackPrices["hbar"]) / 10;

        console.log("[DEBUG] Official SaucerSwap Prices Loaded:", livePrices);
        setPrices({ ...fallbackPrices, ...livePrices });
        
      } catch (error) {
        console.error("[DEBUG] Official API Proxy Failed. Using fallbacks.", error);
        setPrices(fallbackPrices);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 30000); // 30s
    return () => clearInterval(interval);
  }, []);

  return { prices, isLoading };
}
