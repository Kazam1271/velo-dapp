"use client";

import { Wallet, LogOut, ChevronDown, Copy, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useHashConnect } from "@/contexts/HashConnectProvider";
import { HashConnectConnectionState } from "hashconnect";
import { ConnectWalletButton } from "./ConnectWalletButton";
import Image from "next/image";

export default function Header() {
  const [hbarPrice, setHbarPrice] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const hashconnectContext = useHashConnect();
  const state = hashconnectContext?.state;
  const pairingData = hashconnectContext?.pairingData;
  const balance = hashconnectContext?.balance || "0.00";
  const isConnected = hashconnectContext?.isConnected;
  const disconnect = hashconnectContext?.disconnect || (() => {});
  const userAddress = isConnected && pairingData ? pairingData.accountIds[0] : null;

  // ── Fetch live HBAR price ──────────────────────────────────
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

  // ── Close dropdown on outside click ──────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const copyAddress = () => {
    if (userAddress) {
      navigator.clipboard.writeText(userAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const truncateId = (id: string) => {
    const parts = id.split(".");
    if (parts.length < 3) return id;
    const num = parts[2];
    return `${parts[0]}.${parts[1]}.${num.length > 6 ? num.slice(0, 6) + "…" : num}`;
  };

  return (
    <header className="relative flex items-center justify-between w-full px-4 py-4 border-b border-velo-border bg-velo-bg/80 backdrop-blur-md z-50">
      {/* Left Zone: Logo */}
      <div className="flex-1 flex justify-start">
        <div className="flex items-center gap-2 group cursor-pointer active:scale-95 transition-transform">
          <Image 
            src="/logo.png" 
            alt="Velo Logo" 
            width={100} 
            height={36} 
            className="object-contain drop-shadow-[0_0_8px_rgba(6,182,212,0.3)]"
            priority
          />
        </div>
      </div>

      {/* Center Zone: Network/Price (Absolutely Centered) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:flex">
        <div className="flex items-center gap-2 text-xs text-gray-400 bg-velo-card px-3 py-1.5 rounded-full border border-velo-border">
          <span className="w-2 h-2 rounded-full bg-velo-green glow-green" />
          Hedera Testnet <span className="text-velo-green font-medium">{hbarPrice || "…"}</span>
        </div>
      </div>

      {/* Right Zone: Wallet */}
      <div className="flex-1 flex justify-end">
        <div className="relative" ref={dropdownRef}>
          {isConnected && userAddress ? (
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 font-semibold px-4 py-2 rounded-full transition-all bg-velo-card border border-velo-cyan/60 text-velo-cyan hover:bg-cyan-950/40"
            >
              <Wallet size={16} className="shrink-0" />
              <span>{truncateId(userAddress)}</span>
              <ChevronDown size={14} className={`shrink-0 transition-transform ${showDropdown ? "rotate-180" : ""}`} />
            </button>
          ) : (
            <ConnectWalletButton />
          )}

          {showDropdown && isConnected && userAddress && (
            <div className="absolute top-full right-0 mt-2 w-64 bg-[#0c1019] border border-velo-border rounded-xl shadow-2xl z-50 overflow-hidden animate-in slide-in-from-top-2">
              <div className="px-4 pt-4 pb-2">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Account</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono text-velo-cyan">{userAddress}</span>
                  <button onClick={copyAddress} className="text-gray-400 hover:text-white transition-colors p-1">
                    {copied ? <Check size={13} className="text-velo-green" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>

              <div className="px-4 pb-3">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-0.5">Balance</p>
                <p className="text-sm font-medium text-white">{balance} <span className="text-gray-500 text-xs">HBAR</span></p>
              </div>

              <div className="border-t border-velo-border" />

              <button
                onClick={() => {
                  setShowDropdown(false);
                  disconnect();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut size={15} />
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
