import { useState, useEffect, useCallback, useRef } from "react";
import { TOKEN_LIST } from "@/config/tokens";

export function useTokenBalances(hederaAccountId: string | null) {
  const [liveBalances, setLiveBalances] = useState<Record<string, string>>({});
  const [isFetching, setIsFetching] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchBalances = useCallback(async () => {
    if (!hederaAccountId) {
      setLiveBalances({});
      return;
    }

    setIsFetching(true);
    try {
      const resp = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/accounts/${hederaAccountId}/tokens`);
      if (!resp.ok) throw new Error("Mirror Node Error");
      
      const data = await resp.json();
      const balances: Record<string, string> = {};
      
      (data.tokens || []).forEach((t: any) => {
        const registeredToken = TOKEN_LIST.find(rt => rt.tokenId === t.token_id);
        const decimals = registeredToken?.decimals || (t.token_id === "0.0.8725045" ? 8 : 6);
        
        // Mathematical calculation: divide by 10^decimals
        const wholeBalance = t.balance / Math.pow(10, decimals);
        
        // UI Formatting: Show up to 2 decimals for cleaner look
        balances[t.token_id] = wholeBalance.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      });

      setLiveBalances(balances);
    } catch (err) {
      console.error("[useTokenBalances] Fetch error:", err);
    } finally {
      setIsFetching(false);
    }
  }, [hederaAccountId]);

  // Handle Polling
  useEffect(() => {
    fetchBalances();

    // 10 second auto-refresh
    intervalRef.current = setInterval(fetchBalances, 10000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchBalances]);

  return { liveBalances, isFetching, refresh: fetchBalances };
}
