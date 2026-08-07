"use client";

import { ArrowUpDown, ChevronDown, TrendingUp, ShieldCheck, Loader2 } from "lucide-react";
import { useRef, useState, useEffect, useCallback } from "react";
import { Token, ACTIVE_TOKENS } from "@/config/tokens";
import { CONTRACTS, PROTOCOL_FEE_FACTOR, PROTOCOL_FEE_LABEL } from "@/config/contracts";
import { getBestSaucerSwapQuoteDetailed, type QuoteFailure } from "@/lib/saucerswap/quoter";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { ethers } from "ethers";
import { useAppKitAccount, useAppKit, useAppKitProvider } from "@reown/appkit/react";

const MIRROR_BASE = "https://mainnet-public.mirrornode.hedera.com/api/v1";

/**
 * Wait for a tx receipt with a timeout — Hedera's JSON-RPC relay is often slow
 * to return receipts even after the transaction has succeeded on-chain. On
 * timeout, resolve with the submitted hash (the tx was already broadcast).
 */
type ReceiptOutcome = { hash: string; status: "success" | "failed" | "unknown" };

async function waitForReceiptWithTimeout(
  tx: { hash: string; wait: () => Promise<any> },
  timeoutMs = 15000
): Promise<ReceiptOutcome> {
  try {
    const receipt = await Promise.race([
      tx.wait(),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    // Timed out — the tx is broadcast but unconfirmed. NOT a success.
    if (!receipt) return { hash: tx.hash, status: "unknown" };
    const r = receipt as any;
    // status 0 = reverted on-chain. Never report these as success.
    const reverted = r.status === 0 || r.status === 0n || r.status === false;
    return { hash: r.hash || tx.hash, status: reverted ? "failed" : "success" };
  } catch (e: any) {
    // ethers throws CALL_EXCEPTION when the transaction reverted on-chain.
    const msg = e?.shortMessage || e?.message || "";
    if (e?.code === "CALL_EXCEPTION" || /revert|execution reverted/i.test(msg)) {
      return { hash: e?.receipt?.hash || tx.hash, status: "failed" };
    }
    return { hash: tx.hash, status: "unknown" };
  }
}

/**
 * Some wallets (HashPack) never resolve the eth_sendTransaction promise even
 * though the transaction was approved and executed on-chain — which left the
 * UI spinning forever. Give the wallet ample time (user still has to click
 * Approve), then surface a graceful "check your wallet" outcome.
 */
const WALLET_TIMEOUT = Symbol("wallet-timeout");
async function sendWithWalletTimeout<T>(p: Promise<T>, timeoutMs = 120000): Promise<T> {
  const result = await Promise.race([
    p,
    new Promise<typeof WALLET_TIMEOUT>((resolve) => setTimeout(() => resolve(WALLET_TIMEOUT), timeoutMs)),
  ]);
  if (result === WALLET_TIMEOUT) {
    const err: any = new Error("WALLET_TIMEOUT");
    err.walletTimeout = true;
    throw err;
  }
  return result as T;
}

/**
 * HashPack sometimes broadcasts a transaction successfully and then reports an
 * error (or nothing) back to the dApp. Before declaring failure, check the
 * mirror node for a successful proxy transaction from this user that landed
 * after the swap started.
 */
async function findRecentProxySuccess(userEvm: string, sinceMs: number): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(
        `${MIRROR_BASE}/contracts/${CONTRACTS.VeloMainnetProxy}/results?from=${userEvm.toLowerCase()}&limit=3&order=desc`
      );
      if (res.ok) {
        const data = await res.json();
        for (const r of data.results || []) {
          if (parseFloat(r.timestamp) * 1000 < sinceMs) continue;
          const detail = await fetch(`${MIRROR_BASE}/contracts/results/${r.hash}`);
          if (detail.ok) {
            const dr = await detail.json();
            if (dr.result === "SUCCESS") return r.hash;
          }
        }
      }
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

async function fetchHederaBalance(evmAddress: string, tokenEvmAddress?: string): Promise<string> {
  try {
    if (!tokenEvmAddress) {
      // Native HBAR balance
      const res = await fetch(`${MIRROR_BASE}/accounts/${evmAddress}`);
      if (!res.ok) return "0.0000";
      const data = await res.json();
      // balance is in tinybar (8 decimals)
      const hbar = Number(data.balance?.balance ?? 0) / 1e8;
      return hbar.toFixed(4);
    } else {
      // HTS Token balance
      const res = await fetch(`${MIRROR_BASE}/accounts/${evmAddress}/tokens?token.id=${tokenEvmAddress}&limit=1`);
      if (!res.ok) return "0.0000";
      const data = await res.json();
      if (!data.tokens || data.tokens.length === 0) return "0.0000";
      const raw = Number(data.tokens[0].balance ?? 0);
      const decimals = data.tokens[0].decimals ?? 6;
      return (raw / Math.pow(10, decimals)).toFixed(4);
    }
  } catch {
    return "0.0000";
  }
}

export default function SwapInterface() {
  const { address, isConnected } = useAppKitAccount();
  const { open } = useAppKit();
  
  const [isSwapping, setIsSwapping] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
  // Why the last quote failed: a genuinely missing pool vs the quote service
  // being rate limited. These must not be reported to the user the same way.
  const [quoteError, setQuoteError] = useState<QuoteFailure | null>(null);
  // Price impact of the current quote (fraction). Quotes are computed within
  // the current tick range, so a high value also means the estimate itself is
  // less reliable — warn before the user commits.
  const [priceImpact, setPriceImpact] = useState<number | null>(null);
  const [poolFee, setPoolFee] = useState(3000); // best SaucerSwap V2 fee tier for the current pair
  const [payAmount, setPayAmount] = useState("");
  const [receiveAmount, setReceiveAmount] = useState("");
  const [payToken, setPayToken] = useState<Token>(ACTIVE_TOKENS[0]); // HBAR
  const [recvToken, setRecvToken] = useState<Token>(ACTIVE_TOKENS[1]); // SAUCE
  const [payUsd, setPayUsd] = useState("0.00");
  const [receiveUsd, setReceiveUsd] = useState("0.00");
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [payBalance, setPayBalance] = useState("0.0000");
  const [recvBalance, setRecvBalance] = useState("0.0000");
  
  const { walletProvider } = useAppKitProvider('eip155');

  const fetchBalances = useCallback(async () => {
    if (!isConnected || !address) {
      setPayBalance("0.0000");
      setRecvBalance("0.0000");
      return;
    }
    const payIsHbar = payToken.symbol === "HBAR";
    const recvIsHbar = recvToken.symbol === "HBAR";
    const [p, r] = await Promise.all([
      fetchHederaBalance(address, payIsHbar ? undefined : payToken.evmAddress),
      fetchHederaBalance(address, recvIsHbar ? undefined : recvToken.evmAddress),
    ]);
    setPayBalance(p);
    setRecvBalance(r);
  }, [address, isConnected, payToken, recvToken]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  // Best-effort USD reference prices for the fiat estimate only.
  // The actual swap output comes from the on-chain SaucerSwap quote below.
  useEffect(() => {
    let cancelled = false;
    const loadPrices = async () => {
      try {
        const res = await fetch("/api/prices");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !Array.isArray(data)) return;
        // SaucerSwap /tokens returns an array; build a { SYMBOL: usdPrice } map.
        const map: Record<string, number> = {};
        for (const t of data) {
          const p = parseFloat(t.priceUsd ?? t.price ?? "0");
          if (t.symbol && p > 0) map[t.symbol] = p;
        }
        if (map["WHBAR"] && !map["HBAR"]) map["HBAR"] = map["WHBAR"];
        setLivePrices(map);
      } catch {
        /* USD estimate is cosmetic; ignore failures */
      }
    };
    loadPrices();
    return () => { cancelled = true; };
  }, []);

  // Live on-chain quote from SaucerSwap V2 QuoterV2 (mainnet), debounced.
  useEffect(() => {
    const amount = parseFloat(payAmount);
    if (!payAmount || isNaN(amount) || amount <= 0) {
      setPriceImpact(null);
      setReceiveAmount("");
      setPayUsd("0.00");
      setReceiveUsd("0.00");
      setIsQuoting(false);
      return;
    }

    const priceIn = livePrices[payToken.symbol] || 0;
    const priceOut = livePrices[recvToken.symbol] || 0;
    setPayUsd((amount * priceIn).toFixed(2));

    // HBAR <-> WHBAR is a 1:1 wrap handled directly by the proxy — no pool quote.
    // Wrap (HBAR->WHBAR): fee charged ON TOP, user receives exactly what they typed.
    // Unwrap (WHBAR->HBAR): the typed WHBAR is debited as-is (so MAX can use the
    // full balance) and the fee comes out of the HBAR received.
    if (payToken.symbol === "HBAR" && recvToken.symbol === "WHBAR") {
      setReceiveAmount(amount.toFixed(8));
      setReceiveUsd((amount * priceOut).toFixed(2));
      setIsQuoting(false);
      return;
    }
    if (payToken.symbol === "WHBAR" && recvToken.symbol === "HBAR") {
      const out = amount * PROTOCOL_FEE_FACTOR;
      setReceiveAmount(out.toFixed(8));
      setReceiveUsd((out * priceOut).toFixed(2));
      setIsQuoting(false);
      return;
    }

    let cancelled = false;
    setIsQuoting(true);
    const handle = setTimeout(async () => {
      // The protocol fee is charged ON TOP of the typed amount (the wallet is
      // debited amount/(1-fee) and the proxy skims the fee, leaving exactly
      // `amount` for the pool) — so quote against the full typed amount.
      const decimalsIn = payToken.symbol === "HBAR" || payToken.symbol === "WHBAR" ? 8 : payToken.decimals;
      const decimalsOut = recvToken.symbol === "HBAR" || recvToken.symbol === "WHBAR" ? 8 : recvToken.decimals;
      const tokenInId = payToken.symbol === "HBAR" ? "NATIVE" : payToken.tokenId;
      const tokenOutId = recvToken.symbol === "HBAR" ? "NATIVE" : recvToken.tokenId;

      const quote = await getBestSaucerSwapQuoteDetailed(
        tokenInId,
        tokenOutId,
        amount.toFixed(decimalsIn),
        decimalsIn
      );

      if (cancelled) return;

      if (!quote.ok) {
        setQuoteError(quote.reason);
        setPriceImpact(null);
        setReceiveAmount("");
        setReceiveUsd("0.00");
        setIsQuoting(false);
        return;
      }

      setQuoteError(null);
      setPriceImpact(typeof quote.priceImpact === "number" ? quote.priceImpact : null);
      setPoolFee(quote.fee);
      const out = parseFloat(ethers.formatUnits(quote.amountOut, decimalsOut));
      setReceiveAmount(out.toFixed(decimalsOut > 6 ? 6 : 4));
      setReceiveUsd((out * priceOut).toFixed(2));
      setIsQuoting(false);
    }, 500);

    return () => { cancelled = true; clearTimeout(handle); };
  }, [payAmount, payToken, recvToken, livePrices]);


  const handleSwap = async () => {
    if (!isConnected || !address || !payAmount || parseFloat(payAmount) <= 0) return;
    if (isQuoting) return;
    if (!receiveAmount || parseFloat(receiveAmount) <= 0) {
      if (quoteError === "RATE_LIMITED") {
        toast.error("Quote unavailable", { description: "The price service is busy right now — wait a moment and try again." });
      } else {
        toast.error("No route available", { description: "No SaucerSwap V2 pool quote for this pair/amount." });
      }
      return;
    }
    setIsSwapping(true);
    const swapStartedAt = Date.now();
    const toastId = toast.loading("Initiating Swap...");

    const reportSuccess = (txHash: string) => {
      toast.success("Swap Complete! ✓", {
        id: toastId,
        description: `${payAmount} ${payToken.symbol} → ${receiveAmount} ${recvToken.symbol}`,
        action: {
          label: "View on HashScan",
          onClick: () => window.open(`https://hashscan.io/mainnet/transaction/${txHash}`, "_blank"),
        },
      });
      setPayAmount("");
      fetchBalances();
      fetch("/api/xp/swap-reward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, txHash })
      }).catch(e => console.error("XP engine call failed:", e));
    };

    try {
      const isNativeHbarIn = payToken.symbol === "HBAR";
      const decimalsIn = isNativeHbarIn || payToken.symbol === "WHBAR" ? 8 : payToken.decimals;
      // Gross-up: the proxy keeps the protocol fee out of amountIn, so debit
      // typed/(1-fee) — the fee comes out of the remaining balance and the
      // full typed amount reaches the pool. Exception: WHBAR->HBAR unwrap
      // debits exactly the typed amount (fee comes out of the HBAR received),
      // so MAX can spend the full WHBAR balance.
      const isUnwrapPath = payToken.symbol === "WHBAR" && recvToken.symbol === "HBAR";
      const grossIn = isUnwrapPath
        ? parseFloat(payAmount)
        : parseFloat(payAmount) / PROTOCOL_FEE_FACTOR;
      const amountIn = ethers.parseUnits(grossIn.toFixed(decimalsIn), decimalsIn);
      // Native HBAR is sent as msg.value, which the Hedera JSON-RPC relay
      // denominates in weibars (18 decimals) — NOT tinybars. Sending the
      // 8-decimal amount makes the relay truncate msg.value to ~0 and the
      // swap revert with "Transaction failed".
      const hbarValue = ethers.parseUnits(grossIn.toFixed(8), 18);

      const decimalsOut = recvToken.symbol === "HBAR" || recvToken.symbol === "WHBAR" ? 8 : recvToken.decimals;
      const expectedOut = parseFloat(receiveAmount);
      // 1% slippage tolerance (independent of the protocol fee)
      const minAmountOut = ethers.parseUnits((expectedOut * 0.99).toFixed(decimalsOut), decimalsOut);

      if (!walletProvider) throw new Error("Wallet provider not connected");
      const browserProvider = new ethers.BrowserProvider(walletProvider as any);
      const signer = await browserProvider.getSigner();

      // ERC20 Approve step
      if (!isNativeHbarIn) {
        if (!payToken.evmAddress) throw new Error(`${payToken.symbol} is missing an EVM address`);
        toast.loading("Approving Token for Swap...", { id: toastId });
        const tokenContract = new ethers.Contract(payToken.evmAddress, CONTRACTS.ERC20ABI, signer);
        const approveTx = await sendWithWalletTimeout(tokenContract.approve(CONTRACTS.VeloMainnetProxy, amountIn));
        const approveOutcome = await waitForReceiptWithTimeout(approveTx);
        if (approveOutcome.status === "failed") {
          throw new Error("Token approval reverted on-chain — the swap was not attempted.");
        }

        // Wait until the allowance is actually visible on-chain before sending
        // the swap. Some wallets (HashPack) simulate the next tx immediately
        // and reject it if the fresh approval hasn't propagated yet.
        toast.loading("Confirming approval on-chain...", { id: toastId });
        const allowanceCall =
          "0xdd62ed3e" +
          address.toLowerCase().replace("0x", "").padStart(64, "0") +
          CONTRACTS.VeloMainnetProxy.toLowerCase().replace("0x", "").padStart(64, "0");
        for (let i = 0; i < 12; i++) {
          try {
            const res = await fetch(`${MIRROR_BASE}/contracts/call`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ to: payToken.evmAddress, data: allowanceCall }),
            });
            if (res.ok) {
              const out = await res.json();
              if (out.result && BigInt(out.result) >= amountIn) break;
            }
          } catch {
            /* keep polling */
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      toast.loading("Executing Swap via Velo Proxy...", { id: toastId });

      let swapOutcome: ReceiptOutcome | undefined;
      const proxyContract = new ethers.Contract(CONTRACTS.VeloMainnetProxy, CONTRACTS.ProxyABI, signer);

      // We hardcode gasLimit to bypass Hedera's broken eth_estimateGas (returns SENDER_NOT_FOUND).
      // HTS precompile ops (transferFrom/approve/wrap/unwrap) are very gas-hungry:
      // a 500k limit ran out of gas on the unwrap path (observed 499,708 used),
      // and a HashPack-estimated token->HBAR swap used ~1.62M. Hedera charges at
      // least 80% of the limit, so each path gets the smallest safe ceiling.
      // HBAR->WHBAR is a bare wrap (no pool hop) and really does fit in 300k.
      // HBAR->token additionally wraps AND runs a pool swap through HTS: a real
      // mainnet HBAR->SAUCE attempt reverted having burned 289,075/300,000 gas,
      // and eth_estimateGas puts the true cost at ~958k. Don't reuse the wrap
      // limit for the pool path.
      const GAS_LIMIT_WRAP = 300000;         // HBAR->WHBAR only: no pool hop (proven)
      const GAS_LIMIT_HBAR_TO_TOKEN = 1300000; // HBAR->token: wrap + pool swap (~958k measured)
      const GAS_LIMIT_UNWRAP = 1200000;      // WHBAR->HBAR: transferFrom + approvals + WHBAR withdraw
      const GAS_LIMIT_TOKEN_SWAP = 1500000;  // token->token: transferFrom + approvals + pool swap
      const GAS_LIMIT_TOKEN_TO_HBAR = 1800000; // token->HBAR: heaviest — swap + unwrap

      if (isNativeHbarIn) {
        const isBareWrap = recvToken.symbol === "WHBAR";
        const tx = await sendWithWalletTimeout(proxyContract.swapExactHBARForTokens(
          recvToken.evmAddress,
          poolFee,
          minAmountOut,
          { value: hbarValue, gasLimit: isBareWrap ? GAS_LIMIT_WRAP : GAS_LIMIT_HBAR_TO_TOKEN }
        ));
        swapOutcome = await waitForReceiptWithTimeout(tx);
      } else if (payToken.symbol === "WHBAR" && recvToken.symbol === "HBAR") {
        // 1:1 unwrap through the proxy (approve already done above).
        const tx = await sendWithWalletTimeout(proxyContract.swapExactWHBARForHBAR(amountIn, { gasLimit: GAS_LIMIT_UNWRAP }));
        swapOutcome = await waitForReceiptWithTimeout(tx);
      } else if (recvToken.symbol === "HBAR") {
        // Token -> native HBAR: pool swap to WHBAR inside the proxy, then
        // unwrap and deliver HBAR to the user (approve already done above).
        const tx = await sendWithWalletTimeout(proxyContract.swapExactTokensForHBAR(
          payToken.evmAddress,
          poolFee,
          amountIn,
          minAmountOut,
          { gasLimit: GAS_LIMIT_TOKEN_TO_HBAR }
        ));
        swapOutcome = await waitForReceiptWithTimeout(tx);
      } else {
        const tx = await sendWithWalletTimeout(proxyContract.swapExactTokensForTokens(
          payToken.evmAddress,
          recvToken.evmAddress,
          poolFee,
          amountIn,
          minAmountOut,
          { gasLimit: GAS_LIMIT_TOKEN_SWAP }
        ));
        swapOutcome = await waitForReceiptWithTimeout(tx);
      }

      // Only ever claim success on a CONFIRMED successful receipt. A reverted
      // swap previously still showed "Swap Complete!" while the user's wallet
      // showed "Interaction failed" and no tokens arrived.
      if (!swapOutcome) throw new Error("Swap did not execute.");

      if (swapOutcome.status === "failed") {
        toast.error("Swap Failed", {
          id: toastId,
          description: "The transaction reverted on-chain — no tokens were swapped. Network fees still apply.",
          action: {
            label: "View on HashScan",
            onClick: () => window.open(`https://hashscan.io/mainnet/transaction/${swapOutcome!.hash}`, "_blank"),
          },
        });
        fetchBalances();
        return;
      }

      if (swapOutcome.status === "unknown") {
        // Receipt didn't arrive in time — confirm against the chain instead of guessing.
        toast.loading("Confirming on-chain...", { id: toastId });
        const confirmed = address ? await findRecentProxySuccess(address, swapStartedAt) : null;
        if (confirmed) {
          reportSuccess(confirmed);
          return;
        }
        toast.info("Swap submitted — confirmation pending", {
          id: toastId,
          description: "We couldn't confirm it yet. Check HashScan or your wallet before retrying, so you don't swap twice.",
          action: {
            label: "View on HashScan",
            onClick: () => window.open(`https://hashscan.io/mainnet/transaction/${swapOutcome!.hash}`, "_blank"),
          },
        });
        setPayAmount("");
        fetchBalances();
        return;
      }

      reportSuccess(swapOutcome.hash);

    } catch (error: any) {
      console.error("[Swap Error]:", error);
      const msg = error?.shortMessage || error?.message || "";
      const userRejected =
        error?.code === "ACTION_REJECTED" || error?.code === 4001 || /rejected|denied/i.test(msg);

      // HashPack sometimes broadcasts the tx successfully and then reports an
      // error (or goes silent) — verify against the chain before declaring
      // failure, unless the user explicitly rejected in the wallet.
      if (!userRejected) {
        toast.loading("Wallet reported an issue — verifying on-chain...", { id: toastId });
        const confirmedHash = address ? await findRecentProxySuccess(address, swapStartedAt) : null;
        if (confirmedHash) {
          reportSuccess(confirmedHash);
          return;
        }
        if (error?.walletTimeout) {
          toast.info("Wallet didn't respond", {
            id: toastId,
            description: "Your swap may still have completed — check your wallet balance or HashScan. Balances refreshed.",
          });
          setPayAmount("");
          fetchBalances();
          return;
        }
      }
      toast.error(userRejected ? "Transaction rejected" : "Swap Failed", {
        id: toastId,
        description: userRejected ? "You declined the transaction in your wallet." : msg,
      });
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
    if (!isConnected || isSwapping) return;
    // The protocol fee is charged on top of the typed amount, so scale the
    // typed amount down to keep the total debit within the balance — except
    // the WHBAR->HBAR unwrap, which debits exactly what's typed.
    const isUnwrapPath = payToken.symbol === "WHBAR" && recvToken.symbol === "HBAR";
    const raw = parseFloat(payBalance) * pct * (isUnwrapPath ? 1 : PROTOCOL_FEE_FACTOR);
    setPayAmount(raw.toFixed(2));
  };

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
              <div className="text-xs font-bold text-velo-cyan uppercase tracking-wider">Hedera Mainnet</div>
              <div className="text-white font-semibold">{PROTOCOL_FEE_LABEL} Protocol Fee</div>
            </div>
          </div>
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
              tokens={ACTIVE_TOKENS}
              disabledSymbol={recvToken.symbol} 
              onSelect={(t) => { setPayToken(t); if (t.symbol === recvToken.symbol) setRecvToken(ACTIVE_TOKENS.find(x => x.symbol !== t.symbol)!) }} 
            />
          </div>
          <div className="flex justify-between items-center text-sm text-gray-400 mt-5 px-1">
            <div className="flex items-center gap-2">
              <span>Balance:</span>
              <span className="text-velo-cyan">{payBalance} {payToken.symbol}</span>
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
          </div>
          <div className="flex items-center justify-between gap-4">
            <input type="text" placeholder="0.00" value={receiveAmount} readOnly className="bg-transparent text-4xl w-full outline-none text-white font-medium" />
            <TokenDropdown 
              selected={recvToken} 
              tokens={ACTIVE_TOKENS}
              disabledSymbol={payToken.symbol} 
              onSelect={(t) => { setRecvToken(t); if (t.symbol === payToken.symbol) setPayToken(ACTIVE_TOKENS.find(x => x.symbol !== t.symbol)!) }} 
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mt-5 px-1">
            <span>Balance:</span>
            <span className="text-velo-cyan">{recvBalance} {recvToken.symbol}</span>
          </div>
        </div>

        {/* Details Breakdown */}
        {payAmount && parseFloat(payAmount) > 0 && (
          <div className="bg-black/40 border border-white/5 rounded-2xl p-4 mb-4 space-y-2">
            {payToken.symbol === "WHBAR" && recvToken.symbol === "HBAR" ? (
              <>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Protocol Fee (from output)</span>
                  <span className="text-velo-cyan">
                    −{(parseFloat(payAmount) * (1 - PROTOCOL_FEE_FACTOR)).toFixed(4)} HBAR ({PROTOCOL_FEE_LABEL})
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Total Debited</span>
                  <span className="text-white">{parseFloat(payAmount).toFixed(4)} WHBAR</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Protocol Fee (added on top)</span>
                  <span className="text-velo-cyan">
                    +{(parseFloat(payAmount) / PROTOCOL_FEE_FACTOR - parseFloat(payAmount)).toFixed(4)} {payToken.symbol} ({PROTOCOL_FEE_LABEL})
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Total Debited</span>
                  <span className="text-white">{(parseFloat(payAmount) / PROTOCOL_FEE_FACTOR).toFixed(4)} {payToken.symbol}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Routing Path</span>
              <span className="text-white">SaucerSwap V2</span>
            </div>
            {priceImpact !== null && priceImpact > 0.01 && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Price Impact</span>
                <span className={priceImpact > 0.05 ? "text-rose-400 font-bold" : "text-amber-400 font-bold"}>
                  {(priceImpact * 100).toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        )}

        {/* High price impact warning — a large trade moves the pool price against
            the user, and our quote (modelled within the current tick range) also
            gets less reliable as impact grows. */}
        {priceImpact !== null && priceImpact > 0.05 && receiveAmount && (
          <div className={`rounded-2xl p-3 mb-4 border ${priceImpact > 0.15 ? "bg-rose-500/10 border-rose-500/30" : "bg-amber-400/10 border-amber-400/30"}`}>
            <p className={`text-[11px] leading-relaxed ${priceImpact > 0.15 ? "text-rose-300" : "text-amber-300"}`}>
              <span className="font-bold">
                {priceImpact > 0.15 ? "Very high price impact" : "High price impact"} ({(priceImpact * 100).toFixed(1)}%).
              </span>{" "}
              This trade is large relative to the pool, so you&apos;ll get a noticeably worse rate
              {priceImpact > 0.15 ? " and the quote above may overstate what you actually receive" : ""}. Consider swapping a smaller amount.
            </p>
          </div>
        )}

        {/* Action Button */}
        {(() => {
          // The fee is charged ON TOP, so the wallet is debited typed/(1-fee) —
          // block amounts whose gross debit exceeds the balance (the tx would
          // revert on-chain with INSUFFICIENT_TOKEN_BALANCE). The WHBAR->HBAR
          // unwrap debits exactly what's typed (fee comes out of the output).
          const isUnwrapBtn = payToken.symbol === "WHBAR" && recvToken.symbol === "HBAR";
          const grossNeeded = payAmount
            ? (isUnwrapBtn ? parseFloat(payAmount) : parseFloat(payAmount) / PROTOCOL_FEE_FACTOR)
            : 0;
          const insufficient = isConnected && grossNeeded > (parseFloat(payBalance) || 0) + 1e-9;
          return (
            <button
              onClick={() => isConnected ? handleSwap() : open()}
              disabled={isConnected && (isSwapping || isQuoting || !payAmount || parseFloat(payAmount) <= 0 || !receiveAmount || insufficient)}
              className="w-full bg-velo-cyan hover:bg-cyan-400 disabled:opacity-40 text-[#0b0e14] text-lg font-bold py-4 rounded-xl transition-all glow-cyan mb-6 flex items-center justify-center gap-3"
            >
              {isSwapping
                ? <Loader2 size={20} className="animate-spin" />
                : !isConnected
                  ? "CONNECT WALLET"
                  : !payAmount || parseFloat(payAmount) <= 0
                    ? "Enter an amount"
                    : insufficient
                      ? `Insufficient ${payToken.symbol} (fee added on top)`
                      : isQuoting
                        ? "Fetching best price…"
                        : !receiveAmount
                          ? (quoteError === "RATE_LIMITED"
                              ? "Quote unavailable — try again"
                              : "No route available")
                          : `SWAP`
              }
            </button>
          );
        })()}

        {/* Security / Info */}
        <div className="text-center text-[10px] text-gray-500 bg-velo-bg/50 py-3 px-4 rounded-xl border border-velo-border/50 flex items-center justify-center gap-3">
          <ShieldCheck size={14} className="text-velo-cyan shrink-0" />
          <span className="leading-tight">Powered by <span className="text-velo-cyan font-bold">SaucerSwap V2</span> routing.</span>
        </div>
      </div>
    </div>
  );
}

function TokenDropdown({ selected, tokens, onSelect, disabledSymbol }: { selected: Token, tokens: Token[], onSelect: (t: Token) => void, disabledSymbol: string }) {
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
            </button>
          ))}
        </motion.div>
      )}
    </div>
  );
}
