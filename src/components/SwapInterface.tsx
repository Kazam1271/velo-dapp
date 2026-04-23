"use client";

import { ArrowUpDown, ChevronDown, Info, Search, X, TrendingUp, ShieldCheck, RefreshCw, CheckCircle2 } from "lucide-react";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useWeb3, modal } from "@/contexts/Web3Provider";
import { TOKEN_LIST, Token } from "@/config/tokens";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useWaitForTransactionReceipt, useWalletClient } from "wagmi";
import { ethers } from "ethers";
import { getSaucerSwapQuote } from "@/lib/saucerswap/quoter";
import { usePriceFeed } from "@/hooks/usePriceFeed";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { 
  TokenAssociateTransaction, 
  TransferTransaction, 
  ContractExecuteTransaction,
  AccountId, 
  TokenId, 
  Hbar, 
  Transaction,
  TransactionId,
  LedgerId
} from "@hiero-ledger/sdk";
import { DAppSigner } from "@hashgraph/hedera-wallet-connect";

// ─────────────────────────────────────────────────────────────────
// Constants & ABI
// ─────────────────────────────────────────────────────────────────
const TREASURY_EVM_ADDRESS = "0x000000000000000000000000000000000083E0A4"; // 0.0.8642596
const HTS_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000167";
const VELO_EVM_ADDRESS = "0x0000000000000000000000000000000000852235"; // 0.0.8725045

// SaucerSwap V2 Testnet Constants
const SAUCER_QUOTER_V2 = "0x00000000000000000000000000000000003C34AF"; // 0.0.3945935
const SAUCER_ROUTER_V2 = "0x00000000000000000000000000000000003C34AA"; // 0.0.3945930
const VELO_FEE_TREASURY = "0.0.8647225";
const WHBAR_EVM_ADDRESS = "0x000000000000000000000000000000000016FBAB"; // 0.0.1505995

const HTS_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "account", "type": "address" },
      { "internalType": "address", "name": "tokens", "type": "address[]" }
    ],
    "name": "associateTokens",
    "outputs": [{ "internalType": "int64", "name": "responseCode", "type": "int64" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

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
        "internalType": "struct ISwapRouter.ExactInputSingleParams",
        "name": "params",
        "type": "tuple"
      }
    ],
    "name": "exactInputSingle",
    "outputs": [
      { "internalType": "uint256", "name": "amountOut", "type": "uint256" }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "bytes[]", "name": "data", "type": "bytes[]" }
    ],
    "name": "multicall",
    "outputs": [{ "internalType": "bytes[]", "name": "results", "type": "bytes[]" }],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "refundETH",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
] as const;

// ─────────────────────────────────────────────────────────────────
// UI Components
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
            (e.currentTarget as HTMLImageElement).style.opacity = '0'; 
          }}
        />
      )}
      <div className="absolute inset-0 w-full h-full rounded-full flex items-center justify-center bg-slate-700 text-white font-bold z-0" style={{ fontSize: size * 0.45 }}>
        {token.symbol ? token.symbol.charAt(0) : '?'}
      </div>
    </div>
  );
}

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

      {open && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-[#0c1019] border border-velo-border rounded-2xl shadow-2xl z-50 overflow-hidden">
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
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-white">{token.symbol}</span>
                        {token.badge && <TokenBadge badge={token.badge} />}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{token.name}</div>
                    </div>
                    {isSelected && <span className="w-2 h-2 rounded-full bg-velo-cyan shrink-0" />}
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
  const { isConnected, address, hederaAccountId, balance, isRefreshingBalance, connector, walletInterface } = useWeb3();
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapStage, setSwapStage] = useState<"IDLE" | "WAITING_FOR_WALLET" | "VERIFYING_ON_HEDERA" | "TREASURY_SENDING">("IDLE");

  const [payToken, setPayToken] = useState<Token>(TOKEN_LIST[0]);
  const [recvToken, setRecvToken] = useState<Token>(TOKEN_LIST[4]);
  const [payAmount, setPayAmount] = useState("");
  const [receiveAmount, setReceiveAmount] = useState("");
  const [isQuoting, setIsQuoting] = useState(false);
  const [isAssociated, setIsAssociated] = useState(false);

  const { prices } = usePriceFeed();
  const { liveBalances, isFetching: isFetchingBalances, refresh: refreshBalances } = useTokenBalances(hederaAccountId);
  const networkType = process.env.NEXT_PUBLIC_NETWORK_TYPE || "testnet";

  const [isClaiming, setIsClaiming] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [payUsd, setPayUsd] = useState("0.00");
  const [receiveUsd, setReceiveUsd] = useState("0.00");

  const VELO_TOKEN_ID = "0.0.8725045";

  useEffect(() => {
    if (recvToken.tokenId === "NATIVE") {
      setIsAssociated(true);
    } else {
      setIsAssociated(liveBalances[recvToken.tokenId] !== undefined);
    }
  }, [liveBalances, recvToken]);

  const executeNativeTransaction = async (transaction: any) => {
    const provider = await (modal as any).getProvider();
    const topic = provider?.session?.topic;
    
    if (!hederaAccountId) throw new Error("No Hedera Account ID found.");

    if (topic && provider.client) {
      const signer = new DAppSigner(
        AccountId.fromString(hederaAccountId),
        provider.client,
        topic,
        networkType === "mainnet" ? LedgerId.MAINNET : LedgerId.TESTNET
      );
      await transaction.freezeWithSigner(signer);
      const response = await transaction.executeWithSigner(signer);
      await response.getReceiptWithSigner(signer);
      return response;
    } else {
      if (!walletInterface?.executeTransaction) {
        throw new Error("Connected wallet does not support native transaction execution.");
      }
      return await walletInterface.executeTransaction(transaction);
    }
  };

  const handleClaimAirdrop = async () => {
    if (!isConnected || !hederaAccountId || isClaiming || hasClaimed) return;
    setIsClaiming(true);
    const toastId = toast.loading("Preparing Claim Flow...");

    try {
      // 1. Check & Handle Association for VELO
      if (liveBalances[VELO_TOKEN_ID] === undefined) {
        toast.loading("Association Required", { id: toastId, description: "Associating VELO token..." });
        const associateTx = new TokenAssociateTransaction()
          .setAccountId(AccountId.fromString(hederaAccountId))
          .setTokenIds([TokenId.fromString(VELO_TOKEN_ID)]);
        await executeNativeTransaction(associateTx);
        toast.loading("Association confirmed. Executing claim...", { id: toastId });
      }

      // 2. Execute Backend Claim
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

    // Update Pay USD
    const payPrice = getTokenPriceUsd(payToken.symbol, prices);
    setPayUsd((amount * payPrice).toFixed(2));

    setIsQuoting(true);
    const handler = setTimeout(async () => {
      let finalReceive = "0.00";
      if (payToken.symbol === "HBAR" && recvToken.symbol === "VELO") {
        finalReceive = (amount * 10).toFixed(2);
      } else if (payToken.symbol === "VELO" && recvToken.symbol === "HBAR") {
        finalReceive = (amount * 0.1).toFixed(6);
      } else {
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
      }
      setReceiveAmount(finalReceive);
      
      // Update Receive USD
      const recvPrice = getTokenPriceUsd(recvToken.symbol, prices);
      setReceiveUsd((parseFloat(finalReceive) * recvPrice).toFixed(2));
      setIsQuoting(false);
    }, 600);
    return () => clearTimeout(handler);
  }, [payAmount, payToken, recvToken, prices]);

  const handleSwap = async () => {
    if (!isConnected || isSwapping || !payAmount || parseFloat(payAmount) <= 0 || !hederaAccountId) return;

    setIsSwapping(true);
    setSwapStage("WAITING_FOR_WALLET");
    const toastId = toast.loading("Initializing Native Swap Engine...");

    try {
      const targetTokenId = recvToken.tokenId;
      if (targetTokenId !== "NATIVE" && liveBalances[targetTokenId] === undefined) {
        toast.loading("Association Required", { id: toastId, description: `Associating ${recvToken.symbol}...` });
        const associateTx = new TokenAssociateTransaction()
          .setAccountId(AccountId.fromString(hederaAccountId))
          .setTokenIds([TokenId.fromString(targetTokenId)]);
        await executeNativeTransaction(associateTx);
      }

      const tinyTotal = BigInt(Math.floor(parseFloat(payAmount) * Math.pow(10, payToken.decimals)));
      const feeAmount = (tinyTotal * 25n) / 10000n;
      const swapAmount = tinyTotal - feeAmount;
      const deadline = Math.floor(Date.now() / 1000) + 1200;
      const amountOutMin = (ethers.parseUnits(receiveAmount, recvToken.decimals) * 995n) / 1000n;
      const userEvmAddress = (address?.startsWith("0x") ? address : `0x${AccountId.fromString(hederaAccountId!).toSolidityAddress()}`) as `0x${string}`;

      const params = {
        tokenIn: (payToken.symbol === "HBAR" ? WHBAR_EVM_ADDRESS : `0x${TokenId.fromString(payToken.tokenId).toSolidityAddress()}`) as `0x${string}`,
        tokenOut: (recvToken.symbol === "HBAR" ? WHBAR_EVM_ADDRESS : `0x${TokenId.fromString(recvToken.tokenId).toSolidityAddress()}`) as `0x${string}`,
        fee: 3000,
        recipient: userEvmAddress,
        deadline: BigInt(deadline),
        amountIn: swapAmount,
        amountOutMinimum: amountOutMin,
        sqrtPriceLimitX96: 0n
      };

      toast.loading("Step 1/2: Sending 0.25% Velo Fee...", { id: toastId });
      const feeTx = new TransferTransaction();
      if (payToken.symbol === "HBAR") {
        feeTx.addHbarTransfer(AccountId.fromString(hederaAccountId), Hbar.fromTinybars(Number(feeAmount)).negated())
             .addHbarTransfer(AccountId.fromString(VELO_FEE_TREASURY), Hbar.fromTinybars(Number(feeAmount)));
      } else {
        feeTx.addTokenTransfer(payToken.tokenId, AccountId.fromString(hederaAccountId), Number(-feeAmount))
             .addTokenTransfer(payToken.tokenId, AccountId.fromString(VELO_FEE_TREASURY), Number(feeAmount));
      }
      await executeNativeTransaction(feeTx);

      toast.loading("Step 2/2: Executing SaucerSwap Router...", { id: toastId });
      const abi = new ethers.Interface(ROUTER_V2_ABI);
      const swapEncoded = abi.encodeFunctionData('exactInputSingle', [params]);
      const refundEncoded = abi.encodeFunctionData('refundETH', []);
      const multicallEncoded = abi.encodeFunctionData('multicall', [[swapEncoded, refundEncoded]]);
      
      const encodedData = new Uint8Array(multicallEncoded.match(/[\da-f]{2}/gi)!.map(h => parseInt(h, 16)));
      const swapTx = new ContractExecuteTransaction()
        .setContractId(TokenId.fromString("0.0.3945930").toString())
        .setGas(1500000)
        .setFunctionParameters(encodedData);

      if (payToken.symbol === "HBAR") swapTx.setPayableAmount(Hbar.fromTinybars(Number(swapAmount)));

      const result = await executeNativeTransaction(swapTx);
      const hash = result.transactionId ? result.transactionId.toString() : result.hash;

      toast.success("SWAP SUCCESSFUL", {
        id: toastId,
        description: `Successfully traded via SaucerSwap V2 Native Engine.`,
        action: {
          label: "View HashScan",
          onClick: () => window.open(`https://hashscan.io/testnet/transaction/${hash}`, "_blank"),
        },
      });

      refreshBalances();
      setPayAmount("");
    } catch (err: any) {
      console.error("Swap execution failed:", err);
      
      if (err.message && err.message.includes("hedera_signAndExecuteTransaction")) {
        alert("Session Permission Error: Your wallet is connected, but didn't grant smart contract permissions. Please DISCONNECT, remove this site from HashPack 'Connected Sites', and RECONNECT.");
      } else {
        toast.error("Swap Failed", { id: toastId, description: err.message });
      }
    } finally {
      setIsSwapping(false);
      setSwapStage("IDLE");
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

  const payInfo = useMemo(() => {
    if (payToken.tokenId === "NATIVE") return { value: balance, isLoading: isRefreshingBalance };
    const val = liveBalances[payToken.tokenId];
    return { value: val ?? "0.00", isLoading: isFetchingBalances };
  }, [payToken, balance, isRefreshingBalance, liveBalances, isFetchingBalances]);

  const recvInfo = useMemo(() => {
    if (recvToken.tokenId === "NATIVE") return { value: balance, isLoading: isRefreshingBalance };
    const val = liveBalances[recvToken.tokenId];
    return { value: val ?? "0.00", isLoading: isFetchingBalances };
  }, [recvToken, balance, isRefreshingBalance, liveBalances, isFetchingBalances]);

  return (
    <div className="w-full max-w-md mx-auto mt-8 flex flex-col gap-4">
      {/* ── Welcome Promo Banner ─────────────────────────────── */}
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
            <TokenDropdown label="Pay" selected={payToken} disabledSymbol={recvToken.symbol} onSelect={(t) => { setPayToken(t); if (t.symbol === recvToken.symbol) setRecvToken(TOKEN_LIST.find(x => x.symbol !== t.symbol)!) }} />
          </div>
          {/* USD Calculation */}
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
            <TokenDropdown label="Receive" selected={recvToken} disabledSymbol={payToken.symbol} onSelect={(t) => { setRecvToken(t); if (t.symbol === payToken.symbol) setPayToken(TOKEN_LIST.find(x => x.symbol !== t.symbol)!) }} />
          </div>
          {/* USD Calculation */}
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
