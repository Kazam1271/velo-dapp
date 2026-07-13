"use client";

import { useAppKit, useAppKitAccount, useDisconnect } from "@reown/appkit/react";
import { useState, useEffect } from "react";

export const ConnectWalletButton = () => {
  const { isConnected, address } = useAppKitAccount();
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleConnect = () => {
    open();
  };

  if (!mounted) return null;

  if (isConnected && address) {
    // Format address short
    const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
    return (
      <button 
        onClick={() => disconnect()} 
        className="bg-[#141414] text-cyan-400 border border-slate-800 px-4 py-2 rounded-2xl hover:bg-[#1E1E1E] transition-all font-semibold shadow-lg active:scale-95 flex items-center gap-2 group"
      >
        <div className="w-2 h-2 rounded-full bg-cyan-400 group-hover:animate-pulse" />
        {shortAddress} (Disconnect)
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
