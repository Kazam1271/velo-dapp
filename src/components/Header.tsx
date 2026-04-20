"use client";

import { Zap, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

export default function Header() {
  const [hbarPrice, setHbarPrice] = useState<string | null>(null);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=hedera-hashgraph&vs_currencies=usd");
        if (response.ok) {
          const data = await response.json();
          if (data["hedera-hashgraph"] && data["hedera-hashgraph"].usd) {
            setHbarPrice(`$${data["hedera-hashgraph"].usd.toFixed(4)}`);
          }
        }
      } catch (error) {
        console.error("Failed to fetch HBAR price:", error);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <header className="flex items-center justify-between px-4 py-4 border-b border-velo-border sticky top-0 bg-velo-bg/80 backdrop-blur-md z-50">
      <div className="flex items-center gap-2">
        <div className="bg-velo-cyan text-black p-1.5 rounded-full glow-cyan">
          <Zap size={16} fill="currentColor" />
        </div>
        <span className="text-xl font-bold text-white tracking-tight">Velo</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400 bg-velo-card px-3 py-1.5 rounded-full border border-velo-border">
          <span className="w-2 h-2 rounded-full bg-velo-green glow-green"></span>
          Hedera Testnet <span className="text-velo-green font-medium">{hbarPrice || "..."}</span>
        </div>

        <button className="flex items-center gap-2 bg-velo-cyan hover:bg-cyan-400 text-velo-bg font-semibold px-4 py-2 rounded-full transition-all">
          <Wallet size={16} />
          Connect
        </button>
      </div>
    </header>
  );
}
