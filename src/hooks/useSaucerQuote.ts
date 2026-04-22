"use client";

import { useState, useEffect, useRef } from "react";
import { Token } from "@/config/tokens";
import { getSaucerQuote } from "@/lib/hedera/saucerQuote";

/** Returns a live AMM quote from SaucerSwap V1, debounced by 500ms. */
export function useSaucerQuote(
  payAmount: string,
  payToken: Token,
  recvToken: Token
) {
  const [quote, setQuote] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear any pending request
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuote(null);

    const amount = parseFloat(payAmount);
    if (!payAmount || isNaN(amount) || amount <= 0) {
      setIsQuoting(false);
      return;
    }

    // VELO pairs bypass SaucerSwap — enforced externally
    if (payToken.symbol === "VELO" || recvToken.symbol === "VELO") {
      setIsQuoting(false);
      return;
    }

    setIsQuoting(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await getSaucerQuote(amount, payToken, recvToken);
        setQuote(result?.amountOut ?? null);
      } finally {
        setIsQuoting(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [payAmount, payToken.tokenId, recvToken.tokenId]);

  return { quote, isQuoting };
}
