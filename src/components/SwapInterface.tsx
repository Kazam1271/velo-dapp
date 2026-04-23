"use client";

import { ArrowUpDown, ChevronDown, Info, Search, X, TrendingUp, ShieldCheck, RefreshCw, CheckCircle2 } from "lucide-react";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useWeb3, modal } from "@/contexts/Web3Provider";
import { TOKEN_LIST, Token } from "@/config/tokens";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { ethers, Interface } from "ethers";
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
const VELO_FEE_TREASURY = "0x000000000000000000000000000000000083F2B9"; // 0.0.8647225
const WHBAR_EVM_ADDRESS = "0x000000000000000000000000000000000016FBAB"; // 0.0.1505995

// ─────────────────────────────────────────────────────────────────
// HTS System Contract ABI (Simple Associate)
// ─────────────────────────────────────────────────────────────────
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
  },
  {
    "inputs": [
      { "internalType": "address", "name": "token", "type": "address" },
      { "internalType": "address[]", "name": "sender", "type": "address[]" },
      { "internalType": "int64[]", "name": "amount", "type": "int64[]" }
    ],
    "name": "transferTokens",
    "outputs": [{ "internalType": "int64", "name": "responseCode", "type": "int64" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

const QUOTER_V2_ABI = [
  {
    "inputs": [
      {
        "components": [
          { "internalType": "address", "name": "tokenIn", "type": "address" },
          { "internalType": "address", "name": "tokenOut", "type": "address" },
          { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
          { "internalType": "uint24", "name": "fee", "type": "uint24" },
          { "internalType": "uint160", "name": "sqrtPriceLimitX96", "type": "uint160" }
        ],
        "internalType": "struct IQuoterV2.QuoteExactInputSingleParams",
        "name": "params",
        "type": "tuple"
      }
    ],
    "name": "quoteExactInputSingle",
    "outputs": [
      { "internalType": "uint256", "name": "amountOut", "type": "uint256" },
      { "internalType": "uint160", "name": "sqrtPriceX96After", "type": "uint160" },
      { "internalType": "uint32", "name": "initializedTicksCrossed", "type": "uint32" },
      { "internalType": "uint256", "name": "gasEstimate", "type": "uint256" }
    ],
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
  }
] as const;

const ERC20_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "spender", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

// SaucerSwap V2 Router Interface for Native SDK Encoding
const ROUTER_INTERFACE = new Interface([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
  "function refundETH() external payable",
  "function multicall(bytes[] data) external payable returns (bytes[] results)"
]);

const ERC20_INTERFACE = new Interface([
  "function approve(address spender, uint256 amount) external returns (bool)"
]);

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
  const [isAssociating, setIsAssociating] = useState(false);



  const { prices } = usePriceFeed();
  const { liveBalances, isFetching: isFetchingBalances, refresh: refreshBalances } = useTokenBalances(hederaAccountId);

  const { connector, walletInterface } = useWeb3();
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
    console.log("Button Clicked: Associate", { isConnected, address, isAssociating, hederaAccountId });
    if (!isConnected || !address || isAssociating || !hederaAccountId || !walletInterface) {
      return;
    }
    setIsAssociating(true);
    const toastId = toast.loading(`Associating ${recvToken.symbol}...`);
    try {
      const signer = await walletInterface.getSigner();
      
      const tx = new TokenAssociateTransaction()
        .setAccountId(AccountId.fromString(hederaAccountId))
        .setTokenIds([TokenId.fromString(recvToken.tokenId)]);
      
      await tx.freezeWithSigner(signer);
      await tx.executeWithSigner(signer);
      
      toast.success("Association Requested", {
        id: toastId,
        description: "Checking Mirror Node status...",
      });
      
      // Auto-refresh balances to check for association
      setTimeout(refreshBalances, 3000);
    } catch (err: any) {
      if (err.message?.includes("TOKEN_ALREADY_ASSOCIATED") || err.message?.includes("Contract logic reverted")) {
        setIsAssociated(true);
        toast.success("Already Associated", { id: toastId });
      } else {
        toast.error("Association Failed", { id: toastId, description: err.message });
      }
    } finally {
      setIsAssociating(false);
    }
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
        if (!walletInterface) throw new Error("Wallet interface not initialized");
        const signer = await walletInterface.getSigner();

        toast.info("Association Required", {
          id: toastId,
          description: "Signing VELO association via Native SDK...",
        });
        const associateTx = new TokenAssociateTransaction()
          .setAccountId(AccountId.fromString(hederaAccountId))
          .setTokenIds([TokenId.fromString("0.0.8725045")]);
        
        await associateTx.freezeWithSigner(signer);
        await associateTx.executeWithSigner(signer);
        
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
      console.error("Claim Error:", err);
      if (err.message?.includes("TOKEN_ALREADY_ASSOCIATED") || err.message?.includes("Contract logic reverted")) {
        toast.info("Token already associated. Please click Claim again to finish.", { 
          id: toastId,
          duration: 5000 
        });
        refreshBalances();
      } else {
        toast.error("Claim Failed", {
          id: toastId,
          description: err.message.includes("rejected") ? "Transaction was rejected." : err.message,
        });
      }
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
    if (!isConnected || isSwapping || !payAmount || parseFloat(payAmount) <= 0 || !hederaAccountId || !walletInterface)  {
      if (isConnected && (!payAmount || parseFloat(payAmount) <= 0)) {
        toast.error("Invalid Amount", { description: "Please enter a value to swap." });
      }
      return;
    }

    setIsSwapping(true);
    setSwapStage("WAITING_FOR_WALLET");
    const toastId = toast.loading("Preparing SaucerSwap V2 Engine...");

    try {
      // 1. Get Native Signer
      const signer = await walletInterface.getSigner();
      
      // 2. Association Check (Native SDK)
      const targetTokenIdStr = recvToken.tokenId;
      const isTargetAssociated = targetTokenIdStr === "NATIVE" || liveBalances[targetTokenIdStr] !== undefined;
      
      if (!isTargetAssociated) {
        toast.loading(`Associating ${recvToken.symbol}...`, { id: toastId });
        const associateTx = new TokenAssociateTransaction()
          .setAccountId(AccountId.fromString(hederaAccountId))
          .setTokenIds([TokenId.fromString(targetTokenIdStr)]);
        
        await associateTx.freezeWithSigner(signer);
        await associateTx.executeWithSigner(signer);
        toast.loading("Association confirmed. Proceeding to swap...", { id: toastId });
      }

      // 3. Fee Split Logic (0.25%)
      const totalAmountRaw = parseFloat(payAmount);
      const veloFeeAmount = totalAmountRaw * 0.0025;
      const swapAmountNet = totalAmountRaw - veloFeeAmount;

      const tinyTotal = BigInt(Math.floor(totalAmountRaw * Math.pow(10, payToken.decimals)));
      const tinyFee = (tinyTotal * 25n) / 10000n;
      const tinySwap = tinyTotal - tinyFee;

      console.log(`[NativeSwap] Total=${totalAmountRaw}, Fee=${veloFeeAmount}, Swap=${swapAmountNet}`);

      // 4. Execution Flow
      if (payToken.symbol === "HBAR") {
        // --- HBAR SWAP FLOW ---
        
        // A. Send 0.25% Fee to Velo Treasury
        toast.loading("Step 1/2: Sending Service Fee...", { id: toastId });
        const feeTx = new TransferTransaction()
          .addHbarTransfer(AccountId.fromString(hederaAccountId), Hbar.fromTinybars(Math.floor(veloFeeAmount * 1e8)).negated())
          .addHbarTransfer(AccountId.fromString("0.0.8647225"), Hbar.fromTinybars(Math.floor(veloFeeAmount * 1e8)));
        
        await feeTx.freezeWithSigner(signer);
        await feeTx.executeWithSigner(signer);

        // B. Execute Swap (ContractExecuteTransaction)
        toast.loading("Step 2/2: Executing SaucerSwap V2 Trade...", { id: toastId });
        
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
        const amountOutMin = receiveAmount ? (ethers.parseUnits(receiveAmount, recvToken.decimals) * 995n) / 1000n : 0n; // 0.5% slippage

        const params = {
          tokenIn: WHBAR_EVM_ADDRESS,
          tokenOut: `0x${TokenId.fromString(recvToken.tokenId).toSolidityAddress()}`,
          fee: 3000,
          recipient: address,
          deadline: deadline,
          amountIn: tinySwap,
          amountOutMinimum: amountOutMin,
          sqrtPriceLimitX96: 0
        };

        const swapEncoded = ROUTER_INTERFACE.encodeFunctionData('exactInputSingle', [params]);
        const refundEncoded = ROUTER_INTERFACE.encodeFunctionData('refundETH');
        const multicallEncoded = ROUTER_INTERFACE.encodeFunctionData('multicall', [[swapEncoded, refundEncoded]]);
        
        // Convert hex to Uint8Array
        const encodedData = new Uint8Array(multicallEncoded.match(/[\da-f]{2}/gi)!.map(h => parseInt(h, 16)));

        const swapTx = new ContractExecuteTransaction()
          .setContractId("0.0.3945930")
          .setGas(1000000)
          .setPayableAmount(Hbar.fromTinybars(Math.floor(swapAmountNet * 1e8)))
          .setFunctionParameters(encodedData);

        await swapTx.freezeWithSigner(signer);
        const result = await swapTx.executeWithSigner(signer);
        
        toast.success("SWAP SUCCESSFUL", {
          id: toastId,
          description: `Successfully traded via Native SDK.`,
          action: {
            label: "View HashScan",
            onClick: () => window.open(`https://hashscan.io/testnet/transaction/${result.transactionId.toString()}`, "_blank"),
          },
        });

      } else {
        // --- TOKEN SWAP FLOW ---
        const tokenInId = TokenId.fromString(payToken.tokenId);
        const tokenInAddress = `0x${tokenInId.toSolidityAddress()}`;

        // i. Approve Router
        toast.loading("Step 1/3: Approving Router...", { id: toastId });
        const approveParams = [SAUCER_ROUTER_V2, tinySwap];
        const approveEncoded = ERC20_INTERFACE.encodeFunctionData("approve", approveParams);
        const approveData = new Uint8Array(approveEncoded.match(/[\da-f]{2}/gi)!.map(h => parseInt(h, 16)));

        const approveTx = new ContractExecuteTransaction()
          .setContractId(tokenInId.toString())
          .setGas(100000)
          .setFunctionParameters(approveData);
        
        await approveTx.freezeWithSigner(signer);
        await approveTx.executeWithSigner(signer);

        // ii. Fee Transfer
        toast.loading("Step 2/3: Sending Service Fee...", { id: toastId });
        const feeTx = new TransferTransaction()
          .addTokenTransfer(tokenInId, AccountId.fromString(hederaAccountId), -tinyFee)
          .addTokenTransfer(tokenInId, AccountId.fromString("0.0.8647225"), tinyFee);
        
        await feeTx.freezeWithSigner(signer);
        await feeTx.executeWithSigner(signer);

        // iii. Swap
        toast.loading("Step 3/3: Executing SaucerSwap V2 Trade...", { id: toastId });
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
        const amountOutMin = receiveAmount ? (ethers.parseUnits(receiveAmount, recvToken.decimals) * 995n) / 1000n : 0n;

        const params = {
          tokenIn: tokenInAddress,
          tokenOut: (recvToken.tokenId === "NATIVE" ? WHBAR_EVM_ADDRESS : `0x${TokenId.fromString(recvToken.tokenId).toSolidityAddress()}`),
          fee: 3000,
          recipient: address,
          deadline: deadline,
          amountIn: tinySwap,
          amountOutMinimum: amountOutMin,
          sqrtPriceLimitX96: 0
        };

        const swapEncoded = ROUTER_INTERFACE.encodeFunctionData('exactInputSingle', [params]);
        const swapData = new Uint8Array(swapEncoded.match(/[\da-f]{2}/gi)!.map(h => parseInt(h, 16)));

        const swapTx = new ContractExecuteTransaction()
          .setContractId("0.0.3945930")
          .setGas(1000000)
          .setFunctionParameters(swapData);

        await swapTx.freezeWithSigner(signer);
        const result = await swapTx.executeWithSigner(signer);

        toast.success("SWAP SUCCESSFUL", {
          id: toastId,
          description: `Successfully traded via Native SDK.`,
          action: {
            label: "View HashScan",
            onClick: () => window.open(`https://hashscan.io/testnet/transaction/${result.transactionId.toString()}`, "_blank"),
          },
        });
      }

      refreshBalances();
      setPayAmount("");

    } catch (err: any) {
      console.error("Native Swap Error:", err);
      toast.error("Swap Failed", { 
        id: toastId, 
        description: err.message.includes("rejected") ? "Transaction was rejected." : err.message 
      });
    } finally {
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
