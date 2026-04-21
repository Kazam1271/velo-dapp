"use client";

import { Zap, Wallet, Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useWeb3 } from "@/contexts/Web3Provider";
import { useHederaAccount } from "@/hooks/useHederaAccount";

export default function Header() {
  const [hbarPrice, setHbarPrice] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const { address, isConnected, open } = useWeb3();
  const { hederaAccountId, isHollow, isLoading, resolved } = useHederaAccount(
    isConnected ? address : null
  );

  // Fetch live HBAR price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=hedera-hashgraph&vs_currencies=usd"
        );
        if (response.ok) {
          const data = await response.json();
          if (data["hedera-hashgraph"]?.usd) {
            setHbarPrice(`$${data["hedera-hashgraph"].usd.toFixed(4)}`);
          }
        }
      } catch (error) {
        console.error("Failed to fetch HBAR price:", error);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  // Close tooltip on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /**
   * Returns the display label for the connect button:
   * - Disconnected          → "Connect"
   * - Loading ID            → shimmer / truncated 0x
   * - Native ID found       → "0.0.81..." (truncated)
   * - Hollow / not on chain → truncated 0x
   */
  const buttonLabel = (): React.ReactNode => {
    if (!isConnected || !address) return "Connect";

    if (isLoading || !resolved) {
      // Shimmer animation while loading
      return (
        <span className="inline-block w-20 h-3.5 rounded bg-cyan-900/60 animate-pulse" />
      );
    }

    if (hederaAccountId) {
      // Truncate "0.0.12345678" → "0.0.1234..." keeping the prefix readable
      const parts = hederaAccountId.split(".");
      const num = parts[2] ?? "";
      const truncated = num.length > 4 ? `${num.slice(0, 4)}...` : num;
      return `${parts[0]}.${parts[1]}.${truncated}`;
    }

    // Fallback: truncated EVM address
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const isHollowAccount = isConnected && resolved && !hederaAccountId && isHollow;

  return (
    <header className="flex flex-col w-full sticky top-0 z-50">
      <div className="flex items-center justify-between px-4 py-4 border-b border-velo-border bg-velo-bg/80 backdrop-blur-md">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="bg-velo-cyan text-black p-1.5 rounded-full glow-cyan">
            <Zap size={16} fill="currentColor" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">Velo</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Network Pill */}
          <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400 bg-velo-card px-3 py-1.5 rounded-full border border-velo-border">
            <span className="w-2 h-2 rounded-full bg-velo-green glow-green" />
            Hedera Testnet{" "}
            <span className="text-velo-green font-medium">{hbarPrice || "..."}</span>
          </div>

          {/* Connect / Account Button */}
          <div className="relative flex items-center gap-1.5" ref={tooltipRef}>
            <button
              id="connect-wallet-btn"
              onClick={open}
              className={`flex items-center gap-2 font-semibold px-4 py-2 rounded-full transition-all max-w-[180px]
                ${isConnected
                  ? "bg-velo-card border border-velo-cyan text-velo-cyan hover:bg-cyan-950"
                  : "bg-velo-cyan hover:bg-cyan-400 text-velo-bg"
                }`}
            >
              <Wallet size={16} className="shrink-0" />
              <span className="truncate">{buttonLabel()}</span>
            </button>

            {/* Hollow account info icon + tooltip */}
            {isHollowAccount && (
              <button
                id="hollow-account-info-btn"
                onClick={() => setShowTooltip((v) => !v)}
                className="text-amber-400 hover:text-amber-300 transition-colors"
                aria-label="Hollow account info"
              >
                <Info size={15} />
              </button>
            )}

            {/* Tooltip panel */}
            {showTooltip && isHollowAccount && (
              <div className="absolute top-full right-0 mt-2 w-64 bg-[#0f1420] border border-amber-500/40 rounded-xl p-3 shadow-2xl z-50 text-xs text-gray-300 leading-relaxed">
                <p className="font-semibold text-amber-400 mb-1">New Account Detected</p>
                <p>
                  Send <span className="text-velo-cyan font-medium">HBAR</span> to this address to
                  initialize your native Hedera ID (0.0.x) and unlock all features.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
