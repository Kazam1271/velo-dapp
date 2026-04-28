"use client";

import { ArrowUpDown, ChevronDown, Info, TrendingUp, ShieldCheck, RefreshCw, Loader2 } from "lucide-react";
import { useRef, useState, useEffect, useMemo } from "react";
import { useHashConnect } from "@/contexts/HashConnectProvider";
import { HashConnectConnectionState } from "hashconnect";
import { TOKEN_LIST, Token } from "@/config/tokens";
import { toast } from "sonner";
import { Buffer } from "buffer";
import { motion, AnimatePresence } from "framer-motion";
import { ethers } from "ethers";
import { getSaucerSwapQuote } from "@/lib/saucerswap/quoter";
import { usePriceFeed } from "@/hooks/usePriceFeed";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { 
  Transaction,
  TransferTransaction, 
  Hbar, 
  HbarUnit,
  TransactionId, 
  AccountId, 
  TokenId,
  TokenAssociateTransaction,
  ContractExecuteTransaction,
  ContractId
} from "@hiero-ledger/sdk";

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────
const MOCK_WHBAR_TOKEN_ID = "0.0.8735222";
const TREASURY_ID = "0.0.8642596";

// ─────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────
export default function SwapInterface() {
  const { hashconnect, state, pairingData, isConnected, balance, isRefreshingBalance } = useHashConnect();
  const userAddress = isConnected && pairingData ? pairingData.accountIds[0] : null;

  const [isSwapping, setIsSwapping] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [receiveAmount, setReceiveAmount] = useState("");
  const [payToken, setPayToken] = useState<Token>(TOKEN_LIST[0]); // HBAR
  const [recvToken, setRecvToken] = useState<Token>(TOKEN_LIST[4]); // BONZO
  const [isQuoting, setIsQuoting] = useState(false);
  const [payUsd, setPayUsd] = useState("0.00");
  const [receiveUsd, setReceiveUsd] = useState("0.00");
  
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const { liveBalances, isFetching: isFetchingBalances, refresh: refreshBalances } = useTokenBalances(userAddress);
  
  const [isClaiming, setIsClaiming] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);

  const isAssociated = useMemo(() => {
    if (recvToken.tokenId === "NATIVE") return true;
    return liveBalances[recvToken.tokenId] !== undefined;
  }, [recvToken, liveBalances]);

  const isWrapPair = payToken.tokenId === "NATIVE" && recvToken.tokenId === MOCK_WHBAR_TOKEN_ID;

  // ── Sync Balances on Connect ──
  useEffect(() => {
    if (!isConnected || !userAddress) {
      setPayAmount("");
      setReceiveAmount("");
    }
  }, [isConnected, userAddress]);

  // ── Price Polling (Every 10 Seconds) ──
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const res = await fetch("/api/get-prices");
        const data = await res.json();
        if (data.success) {
          setLivePrices(data.prices);
        }
      } catch (err) {
        console.error("Price sync failed:", err);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 10000);
    return () => clearInterval(interval);
  }, []);

  // ── Quote Engine (Using Live Prices) ──
  useEffect(() => {
    const amount = parseFloat(payAmount);
    if (!payAmount || isNaN(amount) || amount <= 0) {
      setReceiveAmount("");
      setPayUsd("0.00");
      setReceiveUsd("0.00");
      return;
    }

    const priceIn = livePrices[payToken.tokenId] || livePrices[payToken.symbol] || 0.08;
    const priceOut = livePrices[recvToken.tokenId] || livePrices[recvToken.symbol] || 0.10;

    if (priceIn > 0 && priceOut > 0) {
      const usdValue = amount * priceIn;
      const amountOut = usdValue / priceOut;
      
      // If it's a sell to HBAR, show estimate minus fee (rough UI estimate)
      let finalOut = amountOut;
      if (recvToken.tokenId === "NATIVE") {
        finalOut = Math.max(0, amountOut - 0.25);
      }

      setReceiveAmount(finalOut.toFixed(recvToken.decimals > 6 ? 6 : 4));
      setPayUsd(usdValue.toFixed(2));
      setReceiveUsd((finalOut * priceOut).toFixed(2));
    }
  }, [payAmount, payToken, recvToken, livePrices]);

  // ── Handlers ──
  const handleSwap = async () => {
    if (!isConnected || !userAddress || !hashconnect || !payAmount || parseFloat(payAmount) <= 0) return;

    setIsSwapping(true);
    const toastId = toast.loading("Initializing Treasury Brokerage...");

    try {
      const signer = hashconnect.getSigner(AccountId.fromString(userAddress) as any) as any;

      // 1. Association Check
      if (!isAssociated && recvToken.tokenId !== "NATIVE") {
        toast.loading(`Associating ${recvToken.symbol}...`, { id: toastId });
        const associateTx = new TokenAssociateTransaction()
          .setAccountId(AccountId.fromString(userAddress))
          .setTokenIds([TokenId.fromString(recvToken.tokenId)]);
        
        await (associateTx as any).freezeWithSigner(signer);
        await (associateTx as any).executeWithSigner(signer);
        
        toast.success(`${recvToken.symbol} Associated!`, { id: toastId });
        refreshBalances();
      }

      // 2. Step 1: Deposit to Treasury
      toast.loading(`Depositing ${payToken.symbol} to Velo Treasury...`, { id: toastId });
      let depositTx = new TransferTransaction();

      if (payToken.tokenId === "NATIVE") {
        depositTx.addHbarTransfer(AccountId.fromString(userAddress), new Hbar(-parseFloat(payAmount)))
                 .addHbarTransfer(AccountId.fromString(TREASURY_ID), new Hbar(parseFloat(payAmount)));
      } else {
        const decimals = (payToken.tokenId === MOCK_WHBAR_TOKEN_ID || payToken.tokenId === "0.0.8725045") ? 8 : 6;
        const amountTiny = Math.floor(parseFloat(payAmount) * Math.pow(10, decimals));
        depositTx.addTokenTransfer(TokenId.fromString(payToken.tokenId), AccountId.fromString(userAddress), -amountTiny)
                 .addTokenTransfer(TokenId.fromString(payToken.tokenId), AccountId.fromString(TREASURY_ID), amountTiny);
      }

      await (depositTx as any).freezeWithSigner(signer);
      const depositResult = await (depositTx as any).executeWithSigner(signer);
      
      if (!depositResult || !depositResult.transactionId) throw new Error("Deposit failed.");

      // 3. Step 2: Backend Payout
      toast.loading("Verifying deposit & processing payout...", { id: toastId });
      const payoutRes = await fetch("/api/broker-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          transactionId: depositResult.transactionId.toString(),
          accountId: userAddress,
          targetTokenId: recvToken.tokenId
        })
      });

      const payoutData = await payoutRes.json();
      if (!payoutRes.ok || !payoutData.success) throw new Error(payoutData.error || "Payout failed");

      toast.success("Swap Complete!", {
        id: toastId,
        description: `Successfully swapped ${payAmount} ${payToken.symbol} via Velo Broker.`,
        action: {
          label: "View Payout",
          onClick: () => window.open(`https://hashscan.io/testnet/transaction/${payoutData.payoutTxId}`, "_blank")
        }
      });

      setPayAmount("");
      refreshBalances();

    } catch (error: any) {
      console.error("[Swap Error]:", error);
      toast.error("Swap Failed", { id: toastId, description: error.message });
    } finally {
      setIsSwapping(false);
    }
  };

  const handleClaimAirdrop = async () => {
    if (!isConnected || isClaiming || hasClaimed || !userAddress) return;
    setIsClaiming(true);
    const toastId = toast.loading("Claiming Early Adopter Bonus...");
    try {
      const response = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: userAddress }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Claim failed");

      if (data.associationRequired) {
        toast.loading("Association Required", { id: toastId, description: "Please associate VELO first." });
        const associateTx = new TokenAssociateTransaction()
          .setAccountId(AccountId.fromString(userAddress))
          .setTokenIds([TokenId.fromString(data.tokenId)]);
        
        const signer = hashconnect.getSigner(AccountId.fromString(userAddress) as any) as any;
        await (associateTx as any).freezeWithSigner(signer);
        await (associateTx as any).executeWithSigner(signer);
        
        setIsClaiming(false);
        handleClaimAirdrop();
        return;
      }

      toast.success("AIRDROP CLAIMED!", {
        id: toastId,
        description: "Funds have arrived from the Velo Treasury.",
        action: { label: "View HashScan", onClick: () => window.open(`https://hashscan.io/testnet/transaction/${data.transactionId}`, "_blank") },
      });
      setHasClaimed(true);
      refreshBalances();
    } catch (err: any) {
      toast.error("Claim Failed", { id: toastId, description: err.message });
    } finally {
      setIsClaiming(false);
    }
  };

  const handleFlip = () => {
    if (isSwapping) return;
    const oldP = payToken;
    const oldR = recvToken;
    setPayToken(oldR);
    setRecvToken(oldP);
  };

  const setPercent = (pct: number) => {
    if (!isConnected || !payInfo.value || isSwapping) return;
    const raw = parseFloat(payInfo.value.replace(/,/g, "")) * pct;
    setPayAmount(raw.toFixed(2));
  };

  const getTokenBalanceInfo = (token: Token) => {
    if (token.tokenId === "NATIVE") return { value: balance, isLoading: isRefreshingBalance };
    const val = liveBalances[token.tokenId];
    return { value: val ?? "0.00", isLoading: isFetchingBalances };
  };

  const payInfo = useMemo(() => getTokenBalanceInfo(payToken), [payToken, balance, isRefreshingBalance, liveBalances, isFetchingBalances]);
  const recvInfo = useMemo(() => getTokenBalanceInfo(recvToken), [recvToken, balance, isRefreshingBalance, liveBalances, isFetchingBalances]);

  const enrichedTokens = useMemo(() => {
    return TOKEN_LIST.map(t => ({
      ...t,
      balance: getTokenBalanceInfo(t).value,
      isLoading: getTokenBalanceInfo(t).isLoading
    }));
  }, [TOKEN_LIST, liveBalances, balance, isRefreshingBalance, isFetchingBalances]);

  return (
    <div className="w-full max-w-md mx-auto mt-8 flex flex-col gap-4">
      {/* Identity Card / Airdrop */}
      {isConnected && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-velo-cyan/10 border border-velo-cyan/30 rounded-2xl p-4 flex items-center justify-between gap-4 overflow-hidden relative group"
        >
          <div className="absolute top-0 right-0 w-32 h-full bg-velo-cyan/5 blur-3xl -z-10" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-velo-cyan/20 flex items-center justify-center text-velo-cyan">
              <TrendingUp size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-velo-cyan uppercase tracking-wider">Early Adopter Bonus</div>
              <div className="text-white font-semibold">Claim 500 VELO</div>
            </div>
          </div>
          <button
            onClick={handleClaimAirdrop}
            disabled={isClaiming || hasClaimed}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${hasClaimed ? "bg-velo-green/20 text-velo-green" : "bg-velo-cyan text-[#0b0e14] hover:bg-cyan-400"}`}
          >
            {hasClaimed ? "\u2713 CLAIMED" : "CLAIM"}
          </button>
        </motion.div>
      )}

      <div className="bg-velo-card border border-velo-border rounded-3xl p-6 shadow-2xl relative">
        {/* Pay Section */}
        <div className="bg-[#0b0e14] rounded-2xl p-4 border border-velo-border mb-2">
          <div className="text-sm text-gray-400 mb-2">You Pay</div>
          <div className="flex items-center justify-between gap-4">
            <input
              type="text"
              placeholder="0.00"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              className="bg-transparent text-4xl w-full outline-none text-white font-medium"
            />
            <TokenDropdown 
              selected={payToken} 
              tokens={enrichedTokens}
              disabledSymbol={recvToken.symbol} 
              onSelect={(t) => { setPayToken(t); if (t.symbol === recvToken.symbol) setRecvToken(TOKEN_LIST.find(x => x.symbol !== t.symbol)!) }} 
            />
          </div>
          <div className="flex justify-between items-center text-sm text-gray-400 mt-5 px-1">
            <div className="flex items-center gap-2">
              <span>Balance:</span>
              <span className="text-velo-cyan">{payInfo.value} {payToken.symbol}</span>
            </div>
            <div className="flex gap-3">
              {[25, 50, 75, 100].map(p => (
                <button key={p} onClick={() => setPercent(p/100)} className="hover:text-velo-cyan text-[10px] font-bold">{p === 100 ? "MAX" : `${p}%`}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Flip Button */}
        <div className="relative flex justify-center -my-3 z-10">
          <button onClick={handleFlip} className="bg-[#1a2130] border border-velo-border rounded-full p-2 hover:bg-[#232d42] transition-all">
            <ArrowUpDown size={16} className="text-velo-cyan" />
          </button>
        </div>

        {/* Receive Section */}
        <div className="bg-[#0b0e14] rounded-2xl p-4 border border-velo-border mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">You Receive</span>
            {isQuoting && <RefreshCw size={12} className="animate-spin text-velo-cyan" />}
          </div>
          <div className="flex items-center justify-between gap-4">
            <input type="text" placeholder="0.00" value={receiveAmount} readOnly className="bg-transparent text-4xl w-full outline-none text-white font-medium" />
            <TokenDropdown 
              selected={recvToken} 
              tokens={enrichedTokens}
              disabledSymbol={payToken.symbol} 
              onSelect={(t) => { setRecvToken(t); if (t.symbol === payToken.symbol) setPayToken(TOKEN_LIST.find(x => x.symbol !== t.symbol)!) }} 
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mt-5 px-1">
            <span>Balance:</span>
            <span className="text-velo-cyan">{recvInfo.value} {recvToken.symbol}</span>
          </div>
        </div>

        {/* Details Breakdown */}
        {payAmount && parseFloat(payAmount) > 0 && (
          <div className="bg-black/40 border border-white/5 rounded-2xl p-4 mb-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Brokerage Fee</span>
              <span className="text-velo-cyan">0.25 HBAR</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Swap Route</span>
              <span className="text-white">Treasury Managed</span>
            </div>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleSwap}
          disabled={!isConnected || isSwapping || !payAmount || parseFloat(payAmount) <= 0}
          className="w-full bg-velo-cyan hover:bg-cyan-400 disabled:opacity-40 text-[#0b0e14] text-lg font-bold py-4 rounded-xl transition-all glow-cyan mb-6 flex items-center justify-center gap-3"
        >
          {isSwapping 
            ? <Loader2 size={20} className="animate-spin" /> 
            : !isConnected 
              ? "CONNECT WALLET"
              : !payAmount || parseFloat(payAmount) <= 0
                ? "Enter an amount"
                : `SWAP`
          }
        </button>

        {/* Security / Info */}
        <div className="text-center text-[10px] text-gray-500 bg-velo-bg/50 py-3 px-4 rounded-xl border border-velo-border/50 flex items-center justify-center gap-3">
          <Info size={14} className="text-velo-cyan shrink-0" />
          <span className="leading-tight">Please ensure you are using an <span className="text-velo-cyan font-bold">ECDSA-type</span> account.</span>
        </div>
      </div>
    </div>
  );
}

function TokenDropdown({ selected, tokens, onSelect, disabledSymbol }: { selected: Token, tokens: any[], onSelect: (t: Token) => void, disabledSymbol: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", clickOutside);
    return () => document.removeEventListener("mousedown", clickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2 bg-[#1a2130] hover:bg-[#232d42] transition-all rounded-2xl px-3 py-2 border border-velo-border group min-w-[110px] justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full overflow-hidden bg-black flex items-center justify-center">
            <img src={selected.logoURI} alt={selected.symbol} className="w-full h-full object-contain" />
          </div>
          <span className="text-white font-bold text-sm tracking-wide">{selected.symbol}</span>
        </div>
        <ChevronDown size={16} className={`text-gray-500 group-hover:text-velo-cyan transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="absolute right-0 mt-2 w-64 bg-[#1a2130] border border-velo-border rounded-2xl shadow-2xl z-50 overflow-hidden py-2 max-h-80 overflow-y-auto">
          {tokens.map((t) => (
            <button
              key={t.symbol}
              disabled={t.symbol === disabledSymbol}
              onClick={() => { onSelect(t); setIsOpen(false); }}
              className={`w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-all text-left ${t.symbol === disabledSymbol ? "opacity-30 grayscale cursor-not-allowed" : ""}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-black p-1 flex items-center justify-center">
                  <img src={t.logoURI} alt={t.symbol} className="w-full h-full object-contain" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                    {t.symbol}
                    {t.badge && <span className="text-[8px] bg-velo-cyan/20 text-velo-cyan px-1 rounded uppercase tracking-tighter">{t.badge}</span>}
                  </div>
                  <div className="text-[10px] text-gray-500">{t.name}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-white">{t.balance}</div>
                {t.isLoading && <RefreshCw size={8} className="animate-spin text-velo-cyan ml-auto" />}
              </div>
            </button>
          ))}
        </motion.div>
      )}
    </div>
  );
}
