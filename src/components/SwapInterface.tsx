"use client";

import { ArrowUpDown, ChevronDown, Info, Search, X, TrendingUp, ShieldCheck, RefreshCw, CheckCircle2 } from "lucide-react";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useWeb3, modal } from "@/contexts/Web3Provider";
import { TOKEN_LIST, Token } from "@/config/tokens";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useWriteContract, useWaitForTransactionReceipt, useSendTransaction, useWalletClient } from "wagmi";
import { parseEther } from "viem";
import { ethers } from "ethers";
import { getSaucerSwapQuote } from "@/lib/saucerswap/quoter";
import { usePriceFeed } from "@/hooks/usePriceFeed";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { 
  TokenAssociateTransaction, 
  TransferTransaction, 
  AccountId, 
  TokenId, 
  Hbar, 
  Transaction,
  TransactionId
} from "@hiero-ledger/sdk";

// ─────────────────────────────────────────────────────────────────
// Constants & ABI
// ─────────────────────────────────────────────────────────────────
const TREASURY_EVM_ADDRESS = "0x000000000000000000000000000000000083E0A4"; // 0.0.8642596
const HTS_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000167";
const VELO_EVM_ADDRESS = "0x0000000000000000000000000000000000852235"; // 0.0.8725045

// ─────────────────────────────────────────────────────────────────
// HTS System Contract ABI (Simple Associate)
// ─────────────────────────────────────────────────────────────────
const HTS_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "account", "type": "address" },
      { "internalType": "address", "name": "tokens", "type": "address[]" }
    ],
    "name": "associate",
    "outputs": [{ "internalType": "int64", "name": "responseCode", "type": "int64" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

// ─────────────────────────────────────────────────────────────────
// Mock balances for non-HBAR tokens
// ─────────────────────────────────────────────────────────────────
// (Mock balances removed, now pulling live from Mirror Node)

// ─────────────────────────────────────────────────────────────────
// TokenBadge
// ─────────────────────────────────────────────────────────────────
function TokenBadge({ badge }: { badge?: "trending" | "verified" | "native" | "pilot" }) {
  if (badge === "trending") {
    return (
      <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider text-orange-400 bg-orange-500/10 border border-orange-500/25 px-1.5 py-0.5 rounded-full">
        <TrendingUp size={8} />
        Hot
      </span>
    );
  }
  if (badge === "verified") {
    return (
      <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider text-velo-cyan bg-cyan-500/10 border border-cyan-500/25 px-1.5 py-0.5 rounded-full">
        <ShieldCheck size={8} />
        Verified
      </span>
    );
  }
  if (badge === "native" || badge === "pilot") {
    return (
      <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider text-white bg-velo-cyan/20 border border-velo-cyan/50 px-1.5 py-0.5 rounded-full shadow-[0_0_8px_rgba(6,182,212,0.3)]">
        {badge}
      </span>
    );
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────
// TokenIcon
// ─────────────────────────────────────────────────────────────────
function TokenIcon({ token, size = 24 }: { token: Token; size?: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {token.iconUrl && (
        <img
          src={token.iconUrl}
          alt={token.symbol}
          className="absolute inset-0 w-full h-full rounded-full object-cover z-10 bg-slate-800"
          referrerPolicy="no-referrer"
          onError={(e) => {
            // Hide image if it fails to load, revealing the letter fallback beneath it
            (e.currentTarget as HTMLImageElement).style.opacity = '0'; 
          }}
        />
      )}
      {/* The Letter Fallback (Always exists, but hidden under the image if the image loads) */}
      <div className="absolute inset-0 w-full h-full rounded-full flex items-center justify-center bg-slate-700 text-white font-bold z-0" style={{ fontSize: size * 0.45 }}>
        {token.symbol ? token.symbol.charAt(0) : '?'}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TokenDropdown
// ─────────────────────────────────────────────────────────────────
interface TokenDropdownProps {
  selected: Token;
  disabledSymbol: string;
  onSelect: (token: Token) => void;
  label: string;
}

function TokenDropdown({ selected, disabledSymbol, onSelect, label }: TokenDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = TOKEN_LIST.filter(
    (t) =>
      t.symbol.toLowerCase().includes(query.toLowerCase()) ||
      t.name.toLowerCase().includes(query.toLowerCase())
  );

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        id={`token-select-${label.replace(/\s+/g, "-").toLowerCase()}`}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 bg-[#1a2130] hover:bg-[#232d42] px-3 py-2 rounded-xl text-white font-semibold transition-colors whitespace-nowrap border border-velo-border"
      >
        <TokenIcon token={selected} size={22} />
        <span>{selected.symbol}</span>
        <ChevronDown
          size={14}
          className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-[#0c1019] border border-velo-border rounded-2xl shadow-2xl z-50 overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-velo-border">
            <Search size={14} className="text-gray-500 shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder="Search tokens…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-transparent text-sm text-white outline-none placeholder-gray-600 flex-1 min-w-0"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-gray-500 hover:text-gray-300">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Token list */}
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-500">No tokens found</div>
            ) : (
              filtered.map((token) => {
                const isDisabled = token.symbol === disabledSymbol;
                const isSelected = token.symbol === selected.symbol;
                return (
                  <button
                    key={token.symbol}
                    disabled={isDisabled}
                    onClick={() => {
                      onSelect(token);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left
                      ${isDisabled ? "opacity-35 cursor-not-allowed" : "hover:bg-white/5 cursor-pointer"}
                      ${isSelected ? "bg-cyan-950/40" : ""}
                    `}
                  >
                    <div className="relative">
                      <TokenIcon token={token} size={32} />
                      {token.symbol === "VELO" && (
                        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-velo-green rounded-full border-2 border-[#0c1019] glow-green" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-white">{token.symbol}</span>
                        {token.badge && <TokenBadge badge={token.badge} />}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{token.name}</div>
                    </div>
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-velo-cyan shrink-0" />
                    )}
                    {isDisabled && (
                      <span className="text-[9px] text-gray-600 shrink-0">In use</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
const getTokenPriceUsd = (symbol: string | undefined, prices: any) => {
  if (!symbol) return 0;
  const cleanSymbol = symbol.toUpperCase().trim();
  if (cleanSymbol === 'USDT' || cleanSymbol === 'USDC') return 1.0;
  return prices[cleanSymbol.toLowerCase()] || 0;
};
// ─────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────
export default function SwapInterface() {
  const { isConnected, address, hederaAccountId, balance, isRefreshingBalance } = useWeb3();
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapStage, setSwapStage] = useState<"IDLE" | "WAITING_FOR_WALLET" | "VERIFYING_ON_HEDERA" | "TREASURY_SENDING">("IDLE");

  const [payToken, setPayToken] = useState<Token>(TOKEN_LIST[0]);   // HBAR
  const [recvToken, setRecvToken] = useState<Token>(TOKEN_LIST[4]);  // BONZO
  const [payAmount, setPayAmount] = useState("");
  const [receiveAmount, setReceiveAmount] = useState("");
  const [isQuoting, setIsQuoting] = useState(false);

  // ── Association Logic (Real) ──────────────────────────────
  const [isAssociated, setIsAssociated] = useState(false);
  const { writeContractAsync, writeContract, data: associateHash, isPending: isAssociating } = useWriteContract();
  const { isSuccess: isAssociateSuccess } = useWaitForTransactionReceipt({ hash: associateHash });
  
  const { sendTransaction, data: swapHash } = useSendTransaction();
  const { isSuccess: isSwapPaymentSuccess, isLoading: isWaitingForReceipt } = useWaitForTransactionReceipt({ hash: swapHash });

  const { prices } = usePriceFeed();
  const { liveBalances, isFetching: isFetchingBalances, refresh: refreshBalances } = useTokenBalances(hederaAccountId);

  const { connector, walletInterface } = useWeb3();
  const { data: walletClient } = useWalletClient();
  const networkType = process.env.NEXT_PUBLIC_NETWORK_TYPE || "testnet";

  // Debug: Monitor Wagmi lifecycle
  useEffect(() => {
    console.log("[WagmiState]", { isConnected, address, hederaAccountId, connectorName: (connector as any)?.name });
  }, [isConnected, address, hederaAccountId, connector]);

  useEffect(() => {
    if (recvToken.tokenId === "NATIVE") {
      setIsAssociated(true);
    } else {
      setIsAssociated(liveBalances[recvToken.tokenId] !== undefined);
    }
  }, [liveBalances, recvToken]);

  const handleAssociate = async () => {
    console.log("Button Clicked: Associate", { isConnected, address, isAssociating });
    if (!isConnected || !address || isAssociating || !hederaAccountId) {
      console.warn("Association blocked", { isConnected, address, isAssociating, hederaAccountId });
      return;
    }
    try {
      console.log(`[Associate] Constructing Native Association for ${recvToken.symbol} (${recvToken.tokenId})...`);
      
      const tx = new TokenAssociateTransaction()
        .setAccountId(AccountId.fromString(hederaAccountId!))
        .setTokenIds([TokenId.fromString(recvToken.tokenId)]);

      await executeNativeTransaction(tx);
      
      toast.success("Association Sent", {
        description: "Checking Mirror Node status...",
      });
      
      // Auto-refresh balances to check for association
      setTimeout(refreshBalances, 3000);
    } catch (err: any) {
      toast.error("Association Failed", { description: err.message });
    }
  };

  // ── Native Execution Helper ────────────────────────────────
  const executeNativeTransaction = async (transaction: any) => {
    // 1. Get the Provider from AppKit
    const universalProvider = await (modal as any).getProvider();
    if (!universalProvider) throw new Error("No provider available - is the wallet connected?");

    // 2. Get Session Data
    const session = universalProvider.session;
    const topic = session?.topic;
    if (!topic || !hederaAccountId) throw new Error("No active session found.");

    // 3. Initialize the DAppSigner
    // This object bridges Reown/WalletConnect directly to the Hedera SDK
    const signer = new DAppSigner(
      AccountId.fromString(hederaAccountId),
      universalProvider.client,
      topic,
      networkType === "mainnet" ? LedgerId.MAINNET : LedgerId.TESTNET
    );

    // 4. Execute with the Signer
    // This triggers the "Smart Contract Execute" or "Associate" popup in HashPack
    await transaction.freezeWithSigner(signer);
    const response = await transaction.executeWithSigner(signer);
    return response;
  };

  // ── Airdrop/Claim Logic ────────────────────────────────────
  const [isClaiming, setIsClaiming] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);

  const handleClaimAirdrop = async () => {
    if (!isConnected || !hederaAccountId || isClaiming || hasClaimed) return;

    setIsClaiming(true);
    const toastId = toast.loading("Preparing Claim Flow...");

    try {
      // 1. Check Association for VELO (0.0.8725045)
      const isVeloAssociated = liveBalances["0.0.8725045"] !== undefined;
      
      if (!isVeloAssociated) {
        toast.info("Association Required", {
          id: toastId,
          description: "Signing VELO association via HashPack...",
        });

        const associateTx = new TokenAssociateTransaction()
          .setAccountId(AccountId.fromString(hederaAccountId))
          .setTokenIds([TokenId.fromString("0.0.8725045")]);

        await executeNativeTransaction(associateTx);
        
        toast.loading("Association confirmed. Executing claim...", { id: toastId });
      } else {
        toast.loading("Executing Treasury Distribution...", { id: toastId });
      }

      // 2. Execute the backend claim request
      const resp = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: hederaAccountId }),
      });

      const data = await resp.json();

      if (!resp.ok) throw new Error(data.message || "Airdrop failed");

      toast.success("500 VELO Successfully Sent!", {
        id: toastId,
        description: "Funds have arrived from the Velo Treasury.",
        action: {
          label: "View HashScan",
          onClick: () => window.open(`https://hashscan.io/testnet/transaction/${data.transactionId}`, "_blank"),
        },
      });

      setHasClaimed(true);
      refreshBalances(); 
    } catch (err: any) {
      toast.error("Claim Failed", {
        id: toastId,
        description: err.message.includes("rejected") ? "Transaction was rejected." : err.message,
      });
    } finally {
      setIsClaiming(false);
    }
  };

  const payInfo = useMemo(() => {
    if (payToken.tokenId === "NATIVE") {
      return { value: balance, isLoading: isRefreshingBalance };
    }
    const val = liveBalances[payToken.tokenId];
    if (val !== undefined) return { value: val, isLoading: isFetchingBalances };
    return { value: "0.00", isLoading: isFetchingBalances };
  }, [payToken, balance, isRefreshingBalance, liveBalances, isFetchingBalances]);

  const recvInfo = useMemo(() => {
    if (recvToken.tokenId === "NATIVE") {
      return { value: balance, isLoading: isRefreshingBalance };
    }
    const val = liveBalances[recvToken.tokenId];
    if (val !== undefined) return { value: val, isLoading: isFetchingBalances };
    return { value: "0.00", isLoading: isFetchingBalances };
  }, [recvToken, balance, isRefreshingBalance, liveBalances, isFetchingBalances]);

  // ── Conversion Logic (Real-Time Quoter) ─────────────────────
  useEffect(() => {
    const amount = parseFloat(payAmount);
    if (!payAmount || isNaN(amount) || amount <= 0) {
      setReceiveAmount("");
      setIsQuoting(false);
      return;
    }

    setIsQuoting(true);
    const handler = setTimeout(async () => {
      // 1. VELO Fixed Rate Check (1 HBAR = 10 VELO)
      if (payToken.symbol === "HBAR" && recvToken.symbol === "VELO") {
        setReceiveAmount((amount * 10).toFixed(2));
        setIsQuoting(false);
      } else if (payToken.symbol === "VELO" && recvToken.symbol === "HBAR") {
        setReceiveAmount((amount * 0.1).toFixed(6));
        setIsQuoting(false);
      } else {
        // 2. Official SaucerSwap V2 Quote
        try {
          console.log(`[Quote] Fetching V2 Quote for ${payAmount} ${payToken.symbol} -> ${recvToken.symbol}`);
          
          const quote = await getSaucerSwapQuote(
            payToken.tokenId,
            recvToken.tokenId,
            payAmount,
            payToken.decimals
          );

          if (quote) {
            const formatted = parseFloat(ethers.formatUnits(quote, recvToken.decimals)).toFixed(recvToken.decimals > 6 ? 6 : 4);
            setReceiveAmount(formatted);
          } else {
            // Fallback to price feed if quoter fails
            const payPrice = getTokenPriceUsd(payToken?.symbol, prices);
            const receivePrice = getTokenPriceUsd(recvToken?.symbol, prices);
            if (payPrice > 0 && receivePrice > 0) {
              const output = (amount * payPrice) / receivePrice;
              setReceiveAmount(output.toFixed(recvToken.decimals > 6 ? 6 : 4));
            }
          }
        } catch (err) {
          console.error("Quoting failed:", err);
        } finally {
          setIsQuoting(false);
        }
      }
    }, 600); // 600ms debounce to avoid RPC spam

    return () => clearTimeout(handler);
  }, [payAmount, payToken, recvToken, prices]);

  const recvAmount = receiveAmount; // for backward compatibility with JSX

  // Swap the two tokens
  const handleFlip = () => {
    if (isSwapping || isAssociating) return;
    const oldPay = payToken;
    const oldRecv = recvToken;
    setPayToken(oldRecv);
    setRecvToken(oldPay);
  };

  const handlePayTokenSelect = (t: Token) => {
    if (isSwapping) return;
    setPayToken(t);
    // Auto-avoid duplicate
    if (t.symbol === recvToken.symbol) {
      const next = TOKEN_LIST.find((x) => x.symbol !== t.symbol) ?? TOKEN_LIST[1];
      setRecvToken(next);
    }
  };

  const handleRecvTokenSelect = (t: Token) => {
    if (isSwapping) return;
    setRecvToken(t);
    if (t.symbol === payToken.symbol) {
      const next = TOKEN_LIST.find((x) => x.symbol !== t.symbol) ?? TOKEN_LIST[0];
      setPayToken(next);
    }
  };

  const handleSwap = async () => {
    console.log("Button Clicked: Swap", { isConnected, isSwapping, payAmount });
    if (!isConnected || isSwapping || !payAmount || parseFloat(payAmount) <= 0 || !hederaAccountId)  {
      console.warn("Swap blocked", { isConnected, isSwapping, payAmount, hederaAccountId });
      if (isConnected && (!payAmount || parseFloat(payAmount) <= 0)) {
        toast.error("Invalid Amount", { description: "Please enter a value to swap." });
      }
      return;
    }

    if (!isAssociated) {
      handleAssociate();
      return;
    }

    setIsSwapping(true);
    setSwapStage("WAITING_FOR_WALLET");

    try {
      const treasuryId = "0.0.8642596";
      const tx = new TransferTransaction();

      if (payToken.symbol === "HBAR") {
        console.log(`[Swap] Constructing HBAR Transfer for ${payAmount}...`);
        tx.addHbarTransfer(AccountId.fromString(hederaAccountId!), Hbar.fromString(payAmount).negated())
          .addHbarTransfer(AccountId.fromString(treasuryId), Hbar.fromString(payAmount));
      } else {
        console.log(`[Swap] Constructing Token Transfer for ${payToken.symbol} (${payToken.tokenId})...`);
        const tinyAmount = BigInt(Math.floor(parseFloat(payAmount) * Math.pow(10, payToken.decimals)));
        tx.addTokenTransfer(payToken.tokenId, AccountId.fromString(hederaAccountId!), -tinyAmount)
          .addTokenTransfer(payToken.tokenId, AccountId.fromString(treasuryId), tinyAmount);
      }

      const result = await executeNativeTransaction(tx);
      const hash = result?.transactionId?.toString() || (result as any)?.transactionHash || (result as any)?.hash; 

      toast.info("Payment Confirmed", {
        description: `Initiating ${recvToken.symbol} fulfillment...`,
      });

      await triggerFulfillment(hash);

    } catch (err: any) {
      toast.error("Transaction Error", { description: err.message });
      setIsSwapping(false);
      setSwapStage("IDLE");
    }
  };

  const triggerFulfillment = async (hash: string) => {
    setSwapStage("VERIFYING_ON_HEDERA");
    const toastId = toast.loading("Verifying on Hedera...");
    
    try {
      const resp = await fetch("/api/swap-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hash,
          accountId: hederaAccountId!,
          targetToken: recvToken.tokenId,
          targetAmount: recvAmount,
        }),
      });
      
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.message || "Verification Failed");
      }

      const data = await resp.json();
      setSwapStage("TREASURY_SENDING");
      
      toast.success("SWAP COMPLETE!", {
        id: toastId,
        description: `Successfully swapped ${payToken.symbol} for ${recvAmount} ${recvToken.symbol}`,
        action: {
          label: "HashScan",
          onClick: () => window.open(`https://hashscan.io/testnet/transaction/${data.transactionId}`, "_blank"),
        },
        duration: 8000,
      });

      refreshBalances();
      setPayAmount("");
    } catch (err: any) {
      toast.error("Protocol Error", { id: toastId, description: err.message });
    } finally {
      setIsSwapping(false);
      setSwapStage("IDLE");
    }
  };


  const setPercent = (pct: number) => {
    if (!isConnected || !payInfo.value || isSwapping) return;
    const raw = parseFloat(payInfo.value.replace(/,/g, "")) * pct;
    setPayAmount(raw.toFixed(2));
  };

  return (
    <div className="w-full max-w-md mx-auto mt-8 flex flex-col gap-4">
      {/* ── Welcome Promo Banner ─────────────────────────────── */}
      {isConnected && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-velo-cyan/10 border border-velo-cyan/30 rounded-2xl p-4 flex items-center justify-between gap-4 overflow-hidden relative group"
        >
          {/* Animated background glow */}
          <div className="absolute top-0 right-0 w-32 h-full bg-velo-cyan/5 blur-3xl -z-10 group-hover:bg-velo-cyan/10 transition-colors" />

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-velo-cyan/20 flex items-center justify-center text-velo-cyan shadow-[0_0_15px_rgba(6,182,212,0.2)]">
              <TrendingUp size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-velo-cyan uppercase tracking-wider">Early Adopter Bonus</div>
              <div className="text-white font-semibold flex items-center gap-1.5">
                Claim 500 VELO
                <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded uppercase tracking-tighter text-gray-400">Gift</span>
              </div>
            </div>
          </div>

          <button
            id="claim-promo-btn"
            onClick={handleClaimAirdrop}
            disabled={isClaiming || hasClaimed}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2
              ${hasClaimed ? "bg-velo-green/20 text-velo-green border border-velo-green/30 cursor-default" :
                isClaiming ? "bg-velo-cyan text-[#0b0e14] animate-pulse-cyan" :
                "bg-velo-cyan text-[#0b0e14] hover:bg-cyan-400 glow-cyan active:scale-95 animate-pulse-cyan"}
            `}
          >
            {isClaiming ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : hasClaimed ? (
              <CheckCircle2 size={14} />
            ) : null}
            {hasClaimed ? "CLAIMED" : "CLAIM"}
          </button>
        </motion.div>
      )}

      <div className="bg-velo-card border border-velo-border rounded-3xl p-4 sm:p-6 shadow-2xl w-full relative">

      {/* ── You Pay ──────────────────────────────────────────── */}
      <div className="bg-[#0b0e14] rounded-2xl p-4 border border-velo-border mb-2 relative">
        <div className="text-sm text-gray-400 mb-2">You Pay</div>
        <div className="flex items-center justify-between gap-4">
          <input
            id="pay-amount-input"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="bg-transparent text-4xl w-full outline-none text-white font-medium placeholder-gray-600"
          />
          <TokenDropdown
            label="Pay"
            selected={payToken}
            disabledSymbol={recvToken.symbol}
            onSelect={handlePayTokenSelect}
          />
        </div>

        {/* Pricing tag */}
        {payAmount && (
          <div className="text-xs text-gray-500 mt-1 px-1">
            ≈ ${(parseFloat(payAmount) * (prices[payToken.symbol.toLowerCase()] || 0)).toFixed(2)} USD
          </div>
        )}

        {/* Balance row */}
        <div className="flex justify-between items-center text-sm text-gray-400 mt-5 px-1">
          <div className="flex items-center gap-2">
            <span>Balance:</span>
            {payInfo.isLoading ? (
              <div className="w-16 h-4 bg-velo-cyan/20 animate-pulse rounded" />
            ) : (
              <span className={isConnected ? "text-velo-cyan font-medium" : ""}>
                {payInfo.value}
              </span>
            )}
          </div>
          <div className="flex gap-3">
            {[25, 50, 75].map((p) => (
              <button
                key={p}
                onClick={() => setPercent(p / 100)}
                className="hover:text-velo-cyan transition-colors text-[10px] font-bold"
              >
                {p}%
              </button>
            ))}
            <button
              onClick={() => setPercent(1)}
              className="hover:text-velo-cyan transition-colors text-[10px] font-bold text-velo-cyan"
            >
              MAX
            </button>
          </div>
        </div>
      </div>

      {/* ── Flip Button ──────────────────────────────────────── */}
      <div className="relative flex justify-center -my-3 z-10">
        <button
          id="swap-flip-btn"
          onClick={handleFlip}
          className="bg-[#1a2130] border border-velo-border rounded-full p-2 hover:bg-[#232d42] hover:rotate-180 transition-all duration-300 shadow-[0_0_10px_rgba(6,182,212,0.15)]"
        >
          <ArrowUpDown size={16} className="text-velo-cyan" />
        </button>
      </div>

      {/* ── You Receive ───────────────────────────────────────── */}
      <div className="bg-[#0b0e14] rounded-2xl p-4 border border-velo-border mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-400">You Receive</span>
          {isQuoting && (
            <span className="flex items-center gap-1 text-[10px] text-velo-cyan/70 uppercase tracking-wider">
              <RefreshCw size={9} className="animate-spin" />
              Fetching quote…
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-4">
          <input
            type="text"
            placeholder={isQuoting ? "…" : "0.00"}
            value={recvAmount}
            readOnly
            className="bg-transparent text-4xl w-full outline-none text-white font-medium placeholder-gray-600"
          />
          <TokenDropdown
            label="Receive"
            selected={recvToken}
            disabledSymbol={payToken.symbol}
            onSelect={handleRecvTokenSelect}
          />
        </div>
        
        {/* Pricing tag */}
        {recvAmount && (
          <div className="text-xs text-gray-500 mt-1 px-1">
            ≈ ${(parseFloat(recvAmount) * (prices[recvToken.symbol.toLowerCase()] || 0)).toFixed(2)} USD
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-gray-400 mt-3 px-1">
          <span>Balance:</span>
          <span className={isConnected ? "text-velo-cyan font-medium" : ""}>{recvInfo.value}</span>
        </div>
      </div>

      {/* ── Market Price Indicator ─────────────────────────── */}
      <div className="px-1 flex justify-between items-center text-[10px] text-gray-500 font-medium">
        <div className="flex items-center gap-1.5">
          <Info size={10} />
          <span>Market Price:</span>
          <span className="text-gray-300">
            1 {payToken?.symbol} = {(() => {
              const payPrice = getTokenPriceUsd(payToken?.symbol, prices);
              const receivePrice = getTokenPriceUsd(recvToken?.symbol, prices);
              const marketRate = (payPrice > 0 && receivePrice > 0) 
                ? (payPrice / receivePrice).toFixed(4) 
                : "0.0000";
              return marketRate;
            })()} {recvToken?.symbol}
          </span>
        </div>
        <div className="text-velo-cyan/60 uppercase tracking-tighter">
          Live via SaucerSwap
        </div>
      </div>

      {/* ── Swap CTA ─────────────────────────────────────────── */}
      <button
        id="swap-cta-btn"
        onClick={handleSwap}
        disabled={!isConnected || isSwapping || isAssociating}
        className="w-full bg-velo-cyan hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-[#0b0e14] text-lg font-bold py-4 rounded-xl transition-all glow-cyan mb-6 flex items-center justify-center gap-3"
      >
        {isSwapping || isAssociating ? (
          <>
            <RefreshCw size={20} className="animate-spin" />
            {isAssociating
              ? "REQUESTING ASSOCIATION..."
              : swapStage === "WAITING_FOR_WALLET"
              ? "WAITING FOR WALLET..."
              : swapStage === "VERIFYING_ON_HEDERA"
              ? "VERIFYING ON HEDERA..."
              : "TREASURY SENDING VELO..."}
          </>
        ) : isConnected ? (
          !isAssociated ? (
            `ASSOCIATE ${recvToken.symbol}`
          ) : (
            `SWAP ${payToken.symbol} → ${recvToken.symbol}`
          )
        ) : (
          "CONNECT WALLET"
        )}
      </button>

      {/* ── ECDSA notice ─────────────────────────────────────── */}
      <div className="text-center text-[10px] text-gray-500 mb-6 bg-velo-bg/50 py-3 px-4 rounded-xl border border-velo-border/50 flex items-center justify-center gap-3">
        <Info size={14} className="text-velo-cyan shrink-0" />
        <span className="leading-tight">
          Please ensure you are using an{" "}
          <span className="text-velo-cyan font-bold">ECDSA-type</span> account for full
          compatibility with Velo.
        </span>
      </div>

      {/* ── Rate / Fee footer ─────────────────────────────────── */}
      <div className="flex justify-between items-center text-sm text-gray-400">
        <div className="flex items-center gap-1.5">
          <Info size={14} className="text-gray-500" />
          Fixed Fee: <span className="text-white">$0.001</span>
        </div>
        <div>
          Slippage: <span className="text-white">0.5%</span>
        </div>
      </div>
    </div>
  </div>
);
}
