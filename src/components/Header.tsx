"use client";

import { Zap, Wallet, Info, LogOut, ChevronDown, Copy, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useWeb3, modal } from "@/contexts/Web3Provider";
import { useHederaAccount } from "@/hooks/useHederaAccount";

export default function Header() {
  const [hbarPrice, setHbarPrice] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { address, isConnected, balance, open, disconnect, isAuthenticated, authenticate } = useWeb3();

  // Diagnostic Log
  useEffect(() => {
    console.log(`[Header] Render State - isConnected: ${isConnected}, address: ${address || "null"}`);
  }, [isConnected, address]);

  // Start Mirror Node lookup as soon as wallet is connected
  const { hederaAccountId, isHollow, isLoading, resolved } = useHederaAccount(
    isConnected ? address : null
  );

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

  // ── Close dropdown / tooltip on outside click ──────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
        setShowTooltip(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Copy address helper ────────────────────────────────────
  const copyAddress = () => {
    const toCopy = hederaAccountId || address;
    if (toCopy) {
      navigator.clipboard.writeText(toCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ── Truncate helpers ───────────────────────────────────────
  const truncateHederaId = (id: string) => {
    const parts = id.split(".");
    const num = parts[2] ?? "";
    const truncated = num.length > 6 ? `${num.slice(0, 6)}…` : num;
    return `${parts[0]}.${parts[1]}.${truncated}`;
  };

  const truncateEvmAddress = (addr: string) =>
    `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  // ── Build button label ─────────────────────────────────────
  const buttonLabel = (): React.ReactNode => {
    if (!isConnected || !address) {
      return "Connect";
    }

    if (isLoading || !resolved) {
      return (
        <span className="flex items-center gap-2">
          <span className="inline-block w-16 h-3 rounded bg-cyan-900/60 animate-pulse" />
          <span className="text-xs text-gray-400">{truncateEvmAddress(address)}</span>
        </span>
      );
    }

    // Mirror Node resolved native ID
    if (hederaAccountId) {
      return truncateHederaId(hederaAccountId);
    }

    // Fallback: hollow account or lookup failed — show EVM address
    return truncateEvmAddress(address);
  };

  // ── Click handler ──────────────────────────────────────────
  const handleButtonClick = () => {
    if (!isConnected) {
      open();
      return;
    }
    setShowDropdown((prev) => !prev);
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
          <span className="text-xl font-bold text-white tracking-tight">
            Velo
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Network Pill */}
          <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400 bg-velo-card px-3 py-1.5 rounded-full border border-velo-border">
            <span className="w-2 h-2 rounded-full bg-velo-green glow-green" />
            Hedera Testnet{" "}
            <span className="text-velo-green font-medium">
              {hbarPrice || "…"}
            </span>
          </div>

          {/* ─── Account Area ─── */}
          <div className="relative" ref={dropdownRef}>
            <button
              id="connect-wallet-btn"
              onClick={handleButtonClick}
              className={`flex items-center gap-2 font-semibold px-4 py-2 rounded-full transition-all max-w-[220px]
                ${
                  isConnected
                    ? "bg-velo-card border border-velo-cyan/60 text-velo-cyan hover:bg-cyan-950/40"
                    : "bg-velo-cyan hover:bg-cyan-400 text-velo-bg"
                }`}
            >
              <Wallet size={16} className="shrink-0" />
              <span className="truncate">{buttonLabel()}</span>

              {isConnected && (
                <ChevronDown
                  size={14}
                  className={`shrink-0 transition-transform ${
                    showDropdown ? "rotate-180" : ""
                  }`}
                />
              )}
            </button>

            {/* Hollow account info badge */}
            {isHollowAccount && (
              <button
                id="hollow-account-info-btn"
                onClick={() => setShowTooltip((v) => !v)}
                className="absolute -right-5 top-1/2 -translate-y-1/2 text-amber-400 hover:text-amber-300 transition-colors"
                aria-label="Hollow account info"
              >
                <Info size={14} />
              </button>
            )}

            {/* Hollow tooltip */}
            {showTooltip && isHollowAccount && (
              <div className="absolute top-full right-0 mt-2 w-64 bg-[#0f1420] border border-amber-500/40 rounded-xl p-3 shadow-2xl z-50 text-xs text-gray-300 leading-relaxed">
                <p className="font-semibold text-amber-400 mb-1">
                  New Account Detected
                </p>
                <p>
                  Send{" "}
                  <span className="text-velo-cyan font-medium">HBAR</span> to
                  this address to initialize your native Hedera ID (0.0.x) and
                  unlock all features.
                </p>
              </div>
            )}

            {/* ─── Account Dropdown ─── */}
            {showDropdown && isConnected && (
              <div className="absolute top-full right-0 mt-2 w-64 bg-[#0c1019] border border-velo-border rounded-xl shadow-2xl z-50 overflow-hidden animate-in slide-in-from-top-2">
                {/* Account ID */}
                <div className="px-4 pt-4 pb-2">
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
                    Account
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono text-velo-cyan">
                      {hederaAccountId || (address ? truncateEvmAddress(address) : "—")}
                    </span>
                    <button
                      onClick={copyAddress}
                      className="text-gray-400 hover:text-white transition-colors p-1"
                      aria-label="Copy address"
                    >
                      {copied ? (
                        <Check size={13} className="text-velo-green" />
                      ) : (
                        <Copy size={13} />
                      )}
                    </button>
                  </div>
                  {/* Show full EVM address underneath if native ID resolved */}
                  {hederaAccountId && address && (
                    <p className="text-[10px] text-gray-600 mt-0.5 font-mono">
                      {truncateEvmAddress(address)}
                    </p>
                  )}
                </div>

                {/* Balance */}
                <div className="px-4 pb-3">
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-0.5">
                    Balance
                  </p>
                  <p className="text-sm font-medium text-white">
                    {balance}{" "}
                    <span className="text-gray-500 text-xs">HBAR</span>
                  </p>
                </div>

                {/* Divider */}
                <div className="border-t border-velo-border" />

                {/* Debug Permissions button */}
                <button
                  onClick={async () => {
                    setShowDropdown(false);
                    const provider = await (modal as any).getProvider();
                    const session = provider?.session;
                    
                    if (!session) {
                      alert("No active session found. Please connect via WalletConnect to test.");
                      return;
                    }

                    const approvedMethods = session.namespaces?.hedera?.methods || [];
                    console.log("Approved Hedera Methods:", approvedMethods);
                    
                    if (approvedMethods.includes('hedera_signAndExecuteTransaction')) {
                      alert("✅ Handshake Success! 'signAndExecute' is approved.\n\nMethods: " + approvedMethods.join(", "));
                    } else {
                      alert("❌ Handshake Failed. Permission was NOT granted by the wallet.\n\nPlease Disconnect here AND in your wallet settings.");
                    }
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                >
                  <Info size={15} />
                  Debug Permissions
                </button>

                {/* Disconnect button */}
                <button
                  id="disconnect-btn"
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
      </div>
    </header>
  );
}
