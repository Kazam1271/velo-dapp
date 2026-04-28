"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { ArrowDown, Info, RefreshCw, TrendingUp, Loader2, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  TokenId, 
  AccountId, 
  TokenAssociateTransaction, 
  TransferTransaction, 
  Transaction,
  Hbar
} from "@hiero-ledger/sdk";
import { useHashConnect } from "@/contexts/HashConnectProvider";
import { toast } from "sonner";
import { TOKEN_LIST, Token } from "@/config/tokens";
import { useHederaBalance } from "@/hooks/useHederaBalance";

// --- CONSTANTS ---
const MOCK_WHBAR_TOKEN_ID = "0.0.8735222";
const TREASURY_ACCOUNT_ID = "0.0.8642596";

export default function SwapInterface() {
  const { isConnected, pairingData, hashconnect } = useHashConnect();
  const userAddress = pairingData?.accountIds?.[0] || null;
  const { balance, isLoading: isRefreshingBalance, refresh: refreshHbarBalance } = useHederaBalance(userAddress);

  // States
  const [payToken, setPayToken] = useState<Token>(TOKEN_LIST[0]); // HBAR
  const [recvToken, setRecvToken] = useState<Token>(TOKEN_LIST[1]); // VELO
  const [payAmount, setPayAmount] = useState("");
  const [receiveAmount, setReceiveAmount] = useState("");
  const [receiveUsd, setReceiveUsd] = useState("0.00");
  const [isSwapping, setIsSwapping] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
  const [liveBalances, setLiveBalances] = useState<Record<string, string>>({});
  const [isFetchingBalances, setIsFetchingBalances] = useState(false);
  const [isAssociated, setIsAssociated] = useState(true);

  // Computed
  const isWrapPair = useMemo(() => {
    return (payToken.symbol === "HBAR" && recvToken.tokenId === MOCK_WHBAR_TOKEN_ID) ||
           (payToken.tokenId === MOCK_WHBAR_TOKEN_ID && recvToken.symbol === "HBAR");
  }, [payToken, recvToken]);

  const isSellFlow = useMemo(() => {
    return payToken.tokenId !== "NATIVE" && recvToken.tokenId === "NATIVE";
  }, [payToken, recvToken]);

  // --- Effects ---

  // Refresh all balances
  const refreshBalances = async () => {
    if (!userAddress) return;
    setIsFetchingBalances(true);
    try {
      refreshHbarBalance();
      const res = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/balances?account.id=${userAddress}`);
      if (res.ok) {
        const data = await res.json();
        const tokens = data.balances[0]?.tokens || [];
        const balances: Record<string, string> = {};
        tokens.forEach((t: any) => {
          balances[t.token_id] = t.balance.toString();
        });
        setLiveBalances(balances);
      }
    } catch (err) {
      console.error("Failed to fetch token balances:", err);
    } finally {
      setIsFetchingBalances(false);
    }
  };

  useEffect(() => {
    if (isConnected && userAddress) {
      refreshBalances();
    }
  }, [isConnected, userAddress]);

  // Check Association
  useEffect(() => {
    if (!isConnected || !userAddress || recvToken.tokenId === "NATIVE") {
      setIsAssociated(true);
      return;
    }
    const check = async () => {
      try {
        const res = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/accounts/${userAddress}/tokens?token.id=${recvToken.tokenId}`);
        if (res.ok) {
          const data = await res.json();
          setIsAssociated(data.tokens && data.tokens.length > 0);
        } else {
          setIsAssociated(false);
        }
      } catch (err) {
        setIsAssociated(false);
      }
    };
    check();
  }, [userAddress, recvToken, isConnected]);

  // Quote Logic
  useEffect(() => {
    if (!payAmount || parseFloat(payAmount) <= 0) {
      setReceiveAmount("");
      setReceiveUsd("0.00");
      return;
    }

    const getQuote = async () => {
      setIsQuoting(true);
      try {
        // Simple logic for Wrap
        if (isWrapPair) {
          setReceiveAmount(payAmount);
          setReceiveUsd((parseFloat(payAmount) * 0.08).toFixed(2));
          return;
        }

        // Fetch from prices API
        const res = await fetch(`/api/prices?payToken=${payToken.tokenId}&recvToken=${recvToken.tokenId}&amount=${payAmount}`);
        if (res.ok) {
          const data = await res.json();
          setReceiveAmount(data.receiveAmount.toFixed(6));
          setReceiveUsd(data.usdValue.toFixed(2));
        }
      } catch (err) {
        console.error("Quoting failed:", err);
      } finally {
        setIsQuoting(false);
      }
    };

    const timer = setTimeout(getQuote, 500);
    return () => clearTimeout(timer);
  }, [payAmount, payToken, recvToken, isWrapPair]);

  // --- Handlers ---

  const handleWrap = async () => {
    if (!isConnected || !userAddress || !hashconnect || !payAmount) return;
    setIsSwapping(true);
    const toastId = toast.loading("Processing Wrap...");

    try {
      const signer = hashconnect.getSigner(AccountId.fromString(userAddress) as any) as any;
      
      // 1. Association check for WHBAR
      if (!isAssociated && recvToken.tokenId !== "NATIVE") {
        toast.loading("Associating WHBAR...", { id: toastId });
        const associateTx = new TokenAssociateTransaction()
          .setAccountId(AccountId.fromString(userAddress))
          .setTokenIds([TokenId.fromString(MOCK_WHBAR_TOKEN_ID)]);
        
        await (associateTx as any).freezeWithSigner(signer);
        await (associateTx as any).executeWithSigner(signer);
        setIsAssociated(true);
      }

      // 2. Transfer HBAR to Treasury for Wrap
      toast.loading("Executing Wrap...", { id: toastId });
      const amountTiny = Math.floor(parseFloat(payAmount) * 100000000);
      
      const transferTx = new TransferTransaction()
        .addHbarTransfer(AccountId.fromString(userAddress), new Hbar(-parseFloat(payAmount)))
        .addHbarTransfer(AccountId.fromString(TREASURY_ACCOUNT_ID), new Hbar(parseFloat(payAmount)));

      await (transferTx as any).freezeWithSigner(signer);
      const executionResult = await (transferTx as any).executeWithSigner(signer);

      if (executionResult && executionResult.transactionId) {
        // 3. Payout WHBAR via Backend
        toast.loading("Verifying Deposit...", { id: toastId });
        const res = await fetch("/api/exchange-whbar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            transactionId: executionResult.transactionId.toString(),
            accountId: userAddress 
          })
        });

        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Exchange failed");

        toast.success("Wrap Successful!", { id: toastId });
      }

      setPayAmount("");
      setTimeout(refreshBalances, 2000);

    } catch (err: any) {
      console.error("[Wrap] Error:", err);
      toast.error("Wrap Failed", { id: toastId, description: err.message });
    } finally {
      setIsSwapping(false);
    }
  };

  const handleSwap = async () => {
    if (!isConnected || !userAddress || !hashconnect || !payAmount || parseFloat(payAmount) <= 0) return;

    setIsSwapping(true);
    const toastId = toast.loading("Processing Swap...");

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
        setIsAssociated(true);
      }

      // CASE A: TOKEN -> HBAR (Brokerage Sell Flow)
      if (isSellFlow) {
        toast.loading(`Sending ${payToken.symbol} to Treasury...`, { id: toastId });
        
        const decimals = (payToken.tokenId === MOCK_WHBAR_TOKEN_ID || payToken.tokenId === "0.0.8725045") ? 8 : 6;
        const amountTiny = Math.floor(parseFloat(payAmount) * Math.pow(10, decimals));

        const transferTx = new TransferTransaction()
          .addTokenTransfer(TokenId.fromString(payToken.tokenId), AccountId.fromString(userAddress), -amountTiny)
          .addTokenTransfer(TokenId.fromString(payToken.tokenId), AccountId.fromString(TREASURY_ACCOUNT_ID), amountTiny);

        await (transferTx as any).freezeWithSigner(signer);
        const signedTransfer = await (transferTx as any).executeWithSigner(signer);
        
        if (!signedTransfer || !signedTransfer.transactionId) throw new Error("Transfer failed.");

        toast.loading("Processing Payout...", { id: toastId });
        const payoutRes = await fetch("/api/broker-payout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            transactionId: signedTransfer.transactionId.toString(),
            accountId: userAddress
          })
        });

        const payoutResult = await payoutRes.json();
        if (!payoutRes.ok || !payoutResult.success) throw new Error(payoutResult.error || "Payout failed");

        toast.success("Sold for HBAR!", { id: toastId, description: `Received ${payoutResult.hbarAmount} HBAR.` });

      } 
      // CASE B: HBAR -> TOKEN (Atomic Swap Flow)
      else {
        toast.loading("Building Transaction...", { id: toastId });
        const response = await fetch("/api/build-swap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            amountIn: parseFloat(payAmount),
            tokenInId: payToken.tokenId,
            tokenOutId: recvToken.tokenId,
            userAddress: userAddress
          })
        });

        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || "Build failed");

        toast.loading("Signing Transaction...", { id: toastId });
        const tx = Transaction.fromBytes(Buffer.from(result.transactionBytes, "hex"));
        const executionResult = await (tx as any).executeWithSigner(signer);
        
        if (executionResult && executionResult.transactionId) {
          toast.success("Swap Complete!", { id: toastId });
        } else {
          throw new Error("Transaction failed.");
        }
      }

      setPayAmount("");
      refreshBalances();

    } catch (err: any) {
      console.error("[Swap] Error:", err);
      toast.error("Swap Failed", { id: toastId, description: err.message });
    } finally {
      setIsSwapping(false);
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
    if (token.tokenId === "NATIVE") {
      return { value: balance, isLoading: isRefreshingBalance };
    }
    const raw = liveBalances[token.tokenId];
    const decimals = (token.tokenId === MOCK_WHBAR_TOKEN_ID || token.tokenId === "0.0.8725045") ? 8 : 6;
    const formatted = raw ? (parseInt(raw) / Math.pow(10, decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "0.00";
    return { value: formatted, isLoading: isFetchingBalances };
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
      {/* ── Early Adopter Bonus ─────────────────────────────── */}
      {isConnected && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-velo-cyan/10 border border-velo-cyan/30 rounded-2xl p-4 flex items-center justify-between gap-4 relative overflow-hidden group">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-velo-cyan/20 flex items-center justify-center text-velo-cyan shadow-[0_0_15px_rgba(6,182,212,0.2)]">
              <TrendingUp size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-velo-cyan uppercase tracking-wider">Early Adopter Bonus</div>
              <div className="text-white font-semibold flex items-center gap-1.5">Claim 500 VELO <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded uppercase text-gray-400">Gift</span></div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Swap Card ─────────────────────────────────────── */}
      <div className="bg-velo-card border border-velo-border rounded-[32px] p-6 shadow-2xl relative">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-black text-white uppercase tracking-tighter italic flex items-center gap-2">
            <ArrowDown className="text-velo-cyan" size={24} /> Swap
          </h2>
          <div className="flex gap-1">
            {[0.25, 0.5, 0.75, 1].map((p) => (
              <button key={p} onClick={() => setPercent(p)} className="px-2.5 py-1 text-[10px] font-bold bg-white/5 hover:bg-velo-cyan/20 text-gray-400 hover:text-velo-cyan rounded-lg border border-white/5 transition-all">
                {p * 100}%
              </button>
            ))}
          </div>
        </div>

        {/* Pay Input */}
        <div className="bg-[#0b0e14] rounded-2xl p-4 border border-velo-border mb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">You Pay</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Balance: {payInfo.value}</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <input type="text" placeholder="0.00" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="bg-transparent text-4xl w-full outline-none text-white font-medium placeholder-gray-600" />
            <TokenDropdown label="Pay" selected={payToken} tokens={enrichedTokens} disabledSymbol={recvToken.symbol} onSelect={(t) => setPayToken(t)} />
          </div>
        </div>

        {/* Flip Button */}
        <div className="flex justify-center -my-3 relative z-10">
          <button onClick={handleFlip} className="bg-[#1a2130] p-2.5 rounded-xl border border-velo-border text-velo-cyan hover:scale-110 active:rotate-180 transition-all shadow-xl group">
            <ArrowDown size={20} className="group-hover:translate-y-0.5 transition-transform" />
          </button>
        </div>

        {/* Receive Input */}
        <div className="bg-[#0b0e14] rounded-2xl p-4 border border-velo-border mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">You Receive</span>
            {isQuoting && <RefreshCw size={9} className="animate-spin text-velo-cyan" />}
          </div>
          <div className="flex items-center justify-between gap-4">
            <input type="text" placeholder="0.00" value={receiveAmount} readOnly className="bg-transparent text-4xl w-full outline-none text-white font-medium placeholder-gray-600" />
            <TokenDropdown label="Receive" selected={recvToken} tokens={enrichedTokens} disabledSymbol={payToken.symbol} onSelect={(t) => setRecvToken(t)} />
          </div>
          {receiveAmount && <div className="text-xs text-gray-500 mt-1">≈ ${receiveUsd} USD</div>}
        </div>

        {/* Sell Breakdown */}
        {isSellFlow && payAmount && parseFloat(payAmount) > 0 && (
          <div className="bg-black/40 border border-white/5 rounded-2xl p-4 space-y-2 mb-4">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Brokerage Fee</span>
              <span className="text-velo-cyan">0.25 HBAR</span>
            </div>
            <div className="pt-2 border-t border-white/5 flex justify-between text-sm font-bold text-velo-green">
              <span>Total Expected Payout</span>
              <span>~ HBAR</span>
            </div>
          </div>
        )}

        <button
          onClick={isWrapPair ? handleWrap : handleSwap}
          disabled={!isConnected || !payAmount || parseFloat(payAmount) <= 0 || isSwapping}
          className={`w-full py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl transition-all
            ${!isConnected || !payAmount || parseFloat(payAmount) <= 0 || isSwapping
              ? "bg-gray-800 text-gray-500 cursor-not-allowed"
              : "bg-gradient-to-r from-velo-cyan to-velo-blue text-white hover:scale-[1.02] active:scale-[0.98]"
            }`}
        >
          {isSwapping ? "Processing..." : 
           !isConnected ? "Connect Wallet" :
           !payAmount || parseFloat(payAmount) <= 0 ? "Enter Amount" :
           isWrapPair ? (isAssociated ? "Wrap Assets" : "Associate & Wrap") :
           isSellFlow ? `Sell ${payToken.symbol} for HBAR` : "Swap Now"}
        </button>

        <div className="text-center text-[10px] text-gray-500 mt-6 flex items-center justify-center gap-2">
          <Info size={14} className="text-velo-cyan" />
          <span>Using <span className="text-velo-cyan font-bold">ECDSA</span> account.</span>
        </div>
      </div>
    </div>
  );
}

function TokenDropdown({ label, selected, tokens, onSelect, disabledSymbol }: { label: string, selected: Token, tokens: any[], onSelect: (t: Token) => void, disabledSymbol: string }) {
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
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="absolute right-0 mt-2 w-64 bg-[#1a2130] border border-velo-border rounded-2xl shadow-2xl z-50 overflow-hidden py-2">
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
              </div>
            </button>
          ))}
        </motion.div>
      )}
    </div>
  );
}
