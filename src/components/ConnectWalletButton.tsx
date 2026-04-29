"use client";

import { useHashConnect } from "@/contexts/HashConnectProvider";
import { useState, useEffect } from "react";

export const ConnectWalletButton = () => {
  const hashconnectContext = useHashConnect();
  const isConnected = hashconnectContext?.isConnected || false;
  const pairingData = hashconnectContext?.pairingData || null;
  const hashconnect = hashconnectContext?.hashconnect || null;
  const disconnect = hashconnectContext?.disconnect || (() => {});
  const isInitialized = hashconnectContext?.isInitialized || false;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const accountId = pairingData?.accountIds[0];

  const handleConnect = () => {
    if (!hashconnect) return;

    // 1. Silver Bullet: If inside HashPack's mobile dApp browser, bypass the modal entirely!
    if (typeof window !== 'undefined' && (window as any).hashpack) {
      (hashconnect as any).connectToLocalWallet();
      return;
    }

    // 2. Otherwise (Desktop or standard Mobile Safari/Chrome), open the official pairing modal
    // This uses the native WalletConnect/HashConnect routing which is most reliable for mobile intents
    try {
      hashconnect.openPairingModal();
    } catch (err) {
      console.error("Failed to open pairing modal", err);
    }
  };

  if (!mounted) return null;

  if (isConnected && accountId) {
    return (
      <button 
        onClick={disconnect} 
        className="bg-[#141414] text-cyan-400 border border-slate-800 px-4 py-2 rounded-2xl hover:bg-[#1E1E1E] transition-all font-semibold shadow-lg active:scale-95 flex items-center gap-2 group"
      >
        <div className="w-2 h-2 rounded-full bg-cyan-400 group-hover:animate-pulse" />
        {accountId} (Disconnect)
      </button>
    );
  }

  if (!isInitialized) {
    return (
      <button 
        disabled
        className="bg-gray-800 text-gray-500 font-bold px-7 py-3 rounded-2xl cursor-wait text-sm tracking-tight"
      >
        Loading...
      </button>
    );
  }

  return (
    <button 
      onClick={handleConnect} 
      className="bg-cyan-500 text-black font-extrabold px-7 py-3 rounded-2xl hover:bg-cyan-400 transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] active:scale-95 text-sm tracking-tight"
    >
      Connect Wallet
    </button>
  );
};
