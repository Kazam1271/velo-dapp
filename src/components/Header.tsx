"use client";

import { Zap, Wallet, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { useAccount, useSwitchChain, useConnect } from "wagmi";

export default function Header() {
  const [hbarPrice, setHbarPrice] = useState<string | null>(null);
  const { open } = useWeb3Modal();
  const { address, isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { connectors } = useConnect();

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

  // Monitor for Wrong Network (Hedera Testnet ID is 296)
  useEffect(() => {
    if (isConnected && chain && chain.id !== 296) {
      const veloToast = (window as any).veloToast;
      if (veloToast) {
        veloToast('Wrong Network: Please switch to Hedera Testnet to use the Velo Pilot.', 'error');
      }
    }
  }, [isConnected, chain]);

  const handleConnect = async () => {
    const veloToast = (window as any).veloToast;

    // Check for Extension Not Found
    const hasWallets = connectors.some(c => c.id === 'injected' || c.id === 'metaMask' || c.id === 'hashpack');
    if (!hasWallets) {
      if (veloToast) veloToast('No Wallet Detected: Install HashPack or MetaMask to get started.', 'error');
      return;
    }

    try {
      await open();
    } catch (error: any) {
      // Handle User Rejected
      if (error.message?.includes('rejected') || error.message?.includes('User rejected')) {
        if (veloToast) veloToast('Connection Cancelled: Please allow the request to access Velo features.', 'error');
      }
    }
  };

  // Simple format for EVM -> 0x12..34abcd
  const truncateAddress = (addr: string) => {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <header className="flex flex-col w-full sticky top-0 z-50">
      {/* Wrong Network Banner (Persistent if wrong) */}
      {isConnected && chain && chain.id !== 296 && (
        <div className="bg-red-500/10 border-b border-red-500/20 py-2 px-4 flex items-center justify-center gap-3 backdrop-blur-sm">
          <AlertCircle size={14} className="text-red-500" />
          <span className="text-[10px] uppercase font-bold tracking-widest text-red-500">Wrong Network detected</span>
          <button 
            onClick={() => switchChain({ chainId: 296 })}
            className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded font-bold hover:bg-red-600 transition-colors"
          >
            Switch to Testnet
          </button>
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-4 border-b border-velo-border bg-velo-bg/80 backdrop-blur-md">
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

          <button 
            onClick={handleConnect}
            className="flex items-center gap-2 bg-velo-cyan hover:bg-cyan-400 text-velo-bg font-semibold px-4 py-2 rounded-full transition-all max-w-[150px]"
          >
            <Wallet size={16} className="shrink-0" />
            <span className="truncate">
              {isConnected && address ? truncateAddress(address) : "Connect"}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
