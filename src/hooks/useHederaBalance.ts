"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getAccountBalance } from "@/lib/mirrorNode";

interface UseHederaBalanceReturn {
  /** Balance in HBAR (formatted string) */
  balance: string;
  /** True while the initial fetch or a refresh is in progress */
  isLoading: boolean;
  /** Force a manual refresh */
  refresh: () => void;
}

const HBAR_DECIMALS = 100_000_000; // 10^8 tinybars = 1 HBAR

/**
 * Hook to manage real-time balance fetching from Hedera Mirror Node.
 * Automatically refreshes every 30 seconds while the account is resolved.
 */
export function useHederaBalance(hederaAccountId: string | null): UseHederaBalanceReturn {
  const [balance, setBalance] = useState("0.00");
  const [isLoading, setIsLoading] = useState(false);
  const refreshInterval = useRef<NodeJS.Timeout | null>(null);

  const fetchBalance = useCallback(async (id: string, isAutoRefresh = false) => {
    if (!isAutoRefresh) setIsLoading(true);
    
    try {
      const tinybars = await getAccountBalance(id);
      const hbar = tinybars / HBAR_DECIMALS;
      const formatted = hbar.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      
      setBalance(formatted);
      console.log(`[useHederaBalance] Updated balance for ${id}: ${formatted} HBAR`);
    } catch (err) {
      console.error("[useHederaBalance] Error updating balance:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    if (hederaAccountId) fetchBalance(hederaAccountId);
  }, [hederaAccountId, fetchBalance]);

  useEffect(() => {
    if (!hederaAccountId) {
      setBalance("0.00");
      setIsLoading(false);
      if (refreshInterval.current) clearInterval(refreshInterval.current);
      return;
    }

    // Initial fetch
    fetchBalance(hederaAccountId);

    // Setup 30s auto-refresh
    refreshInterval.current = setInterval(() => {
      fetchBalance(hederaAccountId, true);
    }, 30000);

    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current);
    };
  }, [hederaAccountId, fetchBalance]);

  return { balance, isLoading, refresh };
}
