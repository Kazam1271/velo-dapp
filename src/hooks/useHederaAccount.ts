"use client";

import { useState, useEffect, useCallback } from "react";
import { getNativeAccountId, HederaAccountInfo } from "@/lib/mirrorNode";

interface UseHederaAccountReturn {
  /** Native Hedera account ID (e.g. "0.0.12345"), or null while loading / not found */
  hederaAccountId: string | null;
  /** Whether the account is a hollow (unfunded) account */
  isHollow: boolean;
  /** True while the Mirror Node request is in-flight */
  isLoading: boolean;
  /** True once the lookup has completed regardless of result */
  resolved: boolean;
}

/**
 * Watches the connected EVM address and resolves it to a native
 * Hedera account ID via the Testnet Mirror Node.
 */
export function useHederaAccount(evmAddress: string | null): UseHederaAccountReturn {
  const [hederaAccountId, setHederaAccountId] = useState<string | null>(null);
  const [isHollow, setIsHollow] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resolved, setResolved] = useState(false);

  const lookup = useCallback(async (address: string) => {
    setIsLoading(true);
    setResolved(false);

    const info: HederaAccountInfo = await getNativeAccountId(address);

    setHederaAccountId(info.accountId);
    setIsHollow(info.isHollow);
    setIsLoading(false);
    setResolved(true);
  }, []);

  useEffect(() => {
    if (!evmAddress) {
      // Wallet disconnected — reset
      setHederaAccountId(null);
      setIsHollow(false);
      setIsLoading(false);
      setResolved(false);
      return;
    }

    lookup(evmAddress);
  }, [evmAddress, lookup]);

  return { hederaAccountId, isHollow, isLoading, resolved };
}
