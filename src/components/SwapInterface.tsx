"use client";

import { ArrowUpDown, ChevronDown, Info, TrendingUp, ShieldCheck, RefreshCw } from "lucide-react";
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
  TransferTransaction, 
  Hbar, 
  TransactionId, 
  AccountId, 
  TokenId,
  TokenAssociateTransaction 
} from "@hiero-ledger/sdk";

// ─────────────────────────────────────────────────────────────────
// Constants & ABI
// ─────────────────────────────────────────────────────────────────
const SAUCER_ROUTER_V2_NATIVE = "0.0.3945930";
const SAUCER_ROUTER_V2_EVM = "0x00000000000000000000000000000000003c37ea";
const WHBAR_EVM_ADDRESS = "0x000000000000000000000000000000000016FBAB"; // 0.0.1505995

const ROUTER_V2_ABI = [
  {
    "inputs": [
      {
        "components": [
          { "internalType": "address", "name": "tokenIn", "type": "address" },
          { "internalType": "address", "name": "tokenOut", "type": "address" },
          { "internalType": "uint24", "name": "fee", "type": "uint24" },
          { "internalType": "address", "name": "recipient", "type": "address" },
          { "internalType": "uint256", "name": "deadline", "type": "uint256" },
          { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
          { "internalType": "uint256", "name": "amountOutMinimum", "type": "uint256" },
          { "internalType": "uint160", "name": "sqrtPriceLimitX96", "type": "uint160" }
        ],
        "internalType": "struct IV3SwapRouter.ExactInputSingleParams",
        "name": "params",
        "type": "tuple"
      }
    ],
    "name": "exactInputSingle",
    "outputs": [{ "internalType": "uint256", "name": "amountOut", "type": "uint256" }],
    "stateMutability": "payable",
    "type": "function"
  }
];

// ─────────────────────────────────────────────────────────────────
// Helper: Price Formatting
// ─────────────────────────────────────────────────────────────────
const getTokenPriceUsd = (symbol: string, prices: any) => {
  const s = symbol.toLowerCase();
  if (s === "hbar") return prices.hbar || 0.09;
  if (s === "velo") return prices.velo || 1.0;
  if (s === "bonzo") return prices.bonzo || 0.02;
  if (s === "sauce") return prices.sauce || 0.06;
  if (s === "pack") return prices.pack || 0.05;
  if (s === "usdc" || s === "usdt") return 1.0;
  return 0;
};

// ─────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────
export default function SwapInterface() {
  const { hashconnect, state, pairingData, hederaAccountId, balance, isRefreshingBalance } = useHashConnect();
  const isConnected = state === HashConnectConnectionState.Connected;
  const [isSwapping, setIsSwapping] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [receiveAmount, setReceiveAmount] = useState("");
  const [payToken, setPayToken] = useState<Token>(TOKEN_LIST[0]); // HBAR
  const [recvToken, setRecvToken] = useState<Token>(TOKEN_LIST[4]); // BONZO
  const [isQuoting, setIsQuoting] = useState(false);
  const [payUsd, setPayUsd] = useState("0.00");
  const [receiveUsd, setReceiveUsd] = useState("0.00");

  const { prices } = usePriceFeed();
  const { liveBalances, isFetching: isFetchingBalances, refresh: refreshBalances } = useTokenBalances(hederaAccountId);
  
  const [isClaiming, setIsClaiming] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);

  const isAssociated = useMemo(() => {
    if (recvToken.tokenId === "NATIVE") return true;
    return liveBalances[recvToken.tokenId] !== undefined;
  }, [recvToken, liveBalances]);

  const handleClaimAirdrop = async () => {
    if (!isConnected || isClaiming || hasClaimed || !hederaAccountId) return;
    setIsClaiming(true);
    const toastId = toast.loading("Claiming Early Adopter Bonus...");
    try {
      const response = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: hederaAccountId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Claim failed");

      if (data.associationRequired) {
        toast.loading("Association Required", { id: toastId, description: "Please associate VELO first." });
        const associateTx = new TokenAssociateTransaction()
          .setAccountId(AccountId.fromString(hederaAccountId))
          .setTokenIds([TokenId.fromString(data.tokenId)]);
        
        const signer = await walletInterface?.getSigner();
        await associateTx.freezeWithSigner(signer);
        await associateTx.executeWithSigner(signer);
        
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

  useEffect(() => {
    const amount = parseFloat(payAmount);
    if (!payAmount || isNaN(amount) || amount <= 0) {
      setReceiveAmount("");
      setPayUsd("0.00");
      setReceiveUsd("0.00");
      setIsQuoting(false);
      return;
    }

    const payPrice = getTokenPriceUsd(payToken.symbol, prices);
    setPayUsd((amount * payPrice).toFixed(2));

    setIsQuoting(true);
    const handler = setTimeout(async () => {
      let finalReceive = "0.00";
      try {
        const quote = await getSaucerSwapQuote(payToken.tokenId, recvToken.tokenId, payAmount, payToken.decimals);
        if (quote) {
          finalReceive = parseFloat(ethers.formatUnits(quote, recvToken.decimals)).toFixed(recvToken.decimals > 6 ? 6 : 4);
        } else {
          const p1 = getTokenPriceUsd(payToken.symbol, prices);
          const p2 = getTokenPriceUsd(recvToken.symbol, prices);
          if (p1 > 0 && p2 > 0) finalReceive = ((amount * p1) / p2).toFixed(recvToken.decimals > 6 ? 6 : 4);
        }
      } catch (err) {
        console.error("Quoting failed:", err);
      }
      setReceiveAmount(finalReceive);
      const recvPrice = getTokenPriceUsd(recvToken.symbol, prices);
      setReceiveUsd((parseFloat(finalReceive) * recvPrice).toFixed(2));
      setIsQuoting(false);
    }, 600);
    return () => clearTimeout(handler);
  }, [payAmount, payToken, recvToken, prices]);

  const handleSwap = async () => {
    if (!isConnected || !hederaAccountId || !hashconnect || !payAmount || parseFloat(payAmount) <= 0) return;

    setIsSwapping(true);
    const toastId = toast.loading("Initializing Atomic Brokerage Swap...");
    const treasuryId = "0.0.8642596";

    try {
      const signer = hashconnect.getSigner(AccountId.fromString(hederaAccountId));

      // 1. Association Check
      if (!isAssociated && recvToken.tokenId !== "NATIVE") {
        toast.loading(`Associating ${recvToken.symbol}...`, { id: toastId });
        const associateTx = new TokenAssociateTransaction()
          .setAccountId(AccountId.fromString(hederaAccountId!))
          .setTokenIds([TokenId.fromString(recvToken.tokenId)]);
        await associateTx.freezeWithSigner(signer);
        await associateTx.executeWithSigner(signer);
      }

      // 2. Build the FULL Atomic Transfer (User & Treasury sides)
      const tx = new TransferTransaction();
      const payAmountNum = parseFloat(payAmount);
      const recvAmountNum = parseFloat(receiveAmount);

      // User -> Treasury (Payment)
      if (payToken.tokenId === "NATIVE") {
        tx.addHbarTransfer(hederaAccountId, new Hbar(-payAmountNum))
          .addHbarTransfer(treasuryId, new Hbar(payAmountNum));
      } else {
        const payTiny = Math.floor(payAmountNum * Math.pow(10, payToken.decimals));
        tx.addTokenTransfer(payToken.tokenId, hederaAccountId, -payTiny)
          .addTokenTransfer(payToken.tokenId, treasuryId, payTiny);
      }

      // Treasury -> User (Payout)
      if (recvToken.tokenId === "NATIVE") {
        tx.addHbarTransfer(treasuryId, new Hbar(-recvAmountNum))
          .addHbarTransfer(hederaAccountId, new Hbar(recvAmountNum));
      } else {
        const recvTiny = Math.floor(recvAmountNum * Math.pow(10, recvToken.decimals));
        tx.addTokenTransfer(recvToken.tokenId, treasuryId, -recvTiny)
          .addTokenTransfer(recvToken.tokenId, hederaAccountId, recvTiny);
      }

      // 3. User pays network fees
      tx.setTransactionId(TransactionId.generate(hederaAccountId));
      await tx.freezeWithSigner(signer);

      // 4. Request User Signature
      toast.loading("Please sign the atomic swap in HashPack...", { id: toastId });
      const signedTx = await signer.signTransaction(tx);

      // 5. Submit to Backend for Verification and Co-Signature
      toast.loading("Verifying with Oracle and co-signing...", { id: toastId });
      const txBytes = Buffer.from(signedTx.toBytes()).toString("hex");

      const response = await fetch("/api/execute-swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          transactionBytes: txBytes,
          hbarAmount: payAmountNum,
          tokenOutId: recvToken.tokenId,
          expectedOut: recvAmountNum
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Brokerage execution failed");

      toast.success("Brokerage Swap Complete!", {
        id: toastId,
        description: `Successfully swapped via OTC Treasury. Rate: ${result.executedRate}`,
        action: {
          label: "View HashScan",
          onClick: () => window.open(`https://hashscan.io/testnet/transaction/${result.txId}`, "_blank")
        }
      });

      setPayAmount("");
      refreshBalances();

    } catch (error: any) {
      console.error("[Swap] Brokerage Error:", error);
      toast.error("Swap Failed", { id: toastId, description: error.message });
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
      {/* ── Early Adopter Bonus ─────────────────────────────── */}
      {isConnected && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-velo-cyan/10 border border-velo-cyan/30 rounded-2xl p-4 flex items-center justify-between gap-4 overflow-hidden relative group"
        >
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
            onClick={handleClaimAirdrop}
            disabled={isClaiming || hasClaimed}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2
              ${hasClaimed ? "bg-velo-green/20 text-velo-green border border-velo-green/30 cursor-default" :
                isClaiming ? "bg-velo-cyan text-[#0b0e14] animate-pulse-cyan" :
                "bg-velo-cyan text-[#0b0e14] hover:bg-cyan-400 glow-cyan active:scale-95 animate-pulse-cyan"}
            `}
          >
            {isClaiming && <RefreshCw size={14} className="animate-spin" />}
            {hasClaimed ? "✓ CLAIMED" : "CLAIM"}
          </button>
        </motion.div>
      )}

      <div className="bg-velo-card border border-velo-border rounded-3xl p-4 sm:p-6 shadow-2xl w-full relative">
        <div className="bg-[#0b0e14] rounded-2xl p-4 border border-velo-border mb-2 relative">
          <div className="text-sm text-gray-400 mb-2">You Pay</div>
          <div className="flex items-center justify-between gap-4">
            <input
              type="text"
              placeholder="0.00"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              className="bg-transparent text-4xl w-full outline-none text-white font-medium placeholder-gray-600"
            />
            <TokenDropdown 
              label="Pay" 
              selected={payToken} 
              tokens={enrichedTokens}
              disabledSymbol={recvToken.symbol} 
              onSelect={(t) => { setPayToken(t); if (t.symbol === recvToken.symbol) setRecvToken(TOKEN_LIST.find(x => x.symbol !== t.symbol)!) }} 
            />
          </div>
          {payAmount && (
            <div className="text-xs text-gray-500 mt-1 px-1">
              ≈ ${payUsd} USD
            </div>
          )}
          <div className="flex justify-between items-center text-sm text-gray-400 mt-5 px-1">
            <div className="flex items-center gap-2">
              <span>Balance:</span>
              <span className="text-velo-cyan">{payInfo.value}</span>
            </div>
            <div className="flex gap-3">
              {[25, 50, 75, 100].map(p => (
                <button key={p} onClick={() => setPercent(p/100)} className="hover:text-velo-cyan text-[10px] font-bold">{p === 100 ? "MAX" : `${p}%`}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="relative flex justify-center -my-3 z-10">
          <button onClick={handleFlip} className="bg-[#1a2130] border border-velo-border rounded-full p-2 hover:bg-[#232d42] transition-all"><ArrowUpDown size={16} className="text-velo-cyan" /></button>
        </div>

        <div className="bg-[#0b0e14] rounded-2xl p-4 border border-velo-border mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">You Receive</span>
            {isQuoting && <RefreshCw size={9} className="animate-spin text-velo-cyan" />}
          </div>
          <div className="flex items-center justify-between gap-4">
            <input type="text" placeholder="0.00" value={receiveAmount} readOnly className="bg-transparent text-4xl w-full outline-none text-white font-medium placeholder-gray-600" />
            <TokenDropdown 
              label="Receive" 
              selected={recvToken} 
              tokens={enrichedTokens}
              disabledSymbol={payToken.symbol} 
              onSelect={(t) => { setRecvToken(t); if (t.symbol === payToken.symbol) setPayToken(TOKEN_LIST.find(x => x.symbol !== t.symbol)!) }} 
            />
          </div>
          {receiveAmount && (
            <div className="text-xs text-gray-500 mt-1 px-1">
              ≈ ${receiveUsd} USD
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-gray-400 mt-3 px-1">
            <span>Balance:</span>
            <span className="text-velo-cyan">{recvInfo.value}</span>
          </div>
        </div>

        <button
          onClick={handleSwap}
          disabled={!isConnected || isSwapping}
          className="w-full bg-velo-cyan hover:bg-cyan-400 disabled:opacity-40 text-[#0b0e14] text-lg font-bold py-4 rounded-xl transition-all glow-cyan mb-6 flex items-center justify-center gap-3"
        >
          {isSwapping ? <RefreshCw size={20} className="animate-spin" /> : isConnected ? (!isAssociated ? `ASSOCIATE ${recvToken.symbol}` : `SWAP ${payToken.symbol} → ${recvToken.symbol}`) : "CONNECT WALLET"}
        </button>

        <div className="text-center text-[10px] text-gray-500 bg-velo-bg/50 py-3 px-4 rounded-xl border border-velo-border/50 flex items-center justify-center gap-3">
          <Info size={14} className="text-velo-cyan shrink-0" />
          <span className="leading-tight">Please ensure you are using an <span className="text-velo-cyan font-bold">ECDSA-type</span> account.</span>
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
          <div className="w-6 h-6 rounded-full overflow-hidden bg-white/10 flex items-center justify-center">
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
                <div className="w-8 h-8 rounded-full overflow-hidden bg-white/10 p-1 flex items-center justify-center">
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
