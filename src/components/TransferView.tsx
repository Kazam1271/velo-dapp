"use client";

import { useState, useEffect } from "react";
import { 
  Send, 
  Clipboard, 
  ChevronDown, 
  X, 
  Check, 
  ArrowRight,
  Info,
  Clock,
  History,
  Search
} from "lucide-react";
import { TOKEN_LIST, Token } from "@/config/tokens";
import { toast } from "sonner";
import { useHederaBalance } from "@/hooks/useHederaBalance";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { useHederaAccount } from "@/hooks/useHederaAccount";
import { supabase } from "@/lib/supabase";
import { ethers } from "ethers";
import { useAppKitAccount, useAppKit, useAppKitProvider } from "@reown/appkit/react";
import { useHashConnect } from "@/contexts/HashConnectContext";
// Native path SDK + helpers — see src/lib/hedera/nativeWallet.ts for the
// @hashgraph/sdk-only and live-node-pinning requirements.
import { AccountId, Hbar, TokenId, TransactionId, TransferTransaction, Long } from "@hashgraph/sdk";
import { fetchLiveNodeAccountIds, resolveRecipientAccountId } from "@/lib/hedera/nativeWallet";

// Minimal ERC20 transfer ABI — HTS tokens expose an ERC20 interface at their EVM address.
const ERC20_TRANSFER_ABI = ["function transfer(address to, uint256 amount) returns (bool)"];

/**
 * Wait for a tx receipt, but don't hang forever — Hedera's JSON-RPC relay is
 * often slow/unreliable at returning receipts even after the transaction has
 * already succeeded on-chain. If the receipt doesn't arrive in time, resolve
 * with the submitted hash (the wallet already accepted and broadcast the tx).
 */
async function waitForReceiptWithTimeout(tx: { hash: string; wait: () => Promise<any> }, timeoutMs = 15000): Promise<string> {
  try {
    const receipt = await Promise.race([
      tx.wait(),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return (receipt as any)?.hash || tx.hash;
  } catch {
    // Receipt polling failed but the tx was already broadcast — return its hash.
    return tx.hash;
  }
}

/** Deterministic "long-zero" EVM address for a Hedera account id ("0.0.x"). */
function toEvmAddress(idOrAddr: string): string {
  const s = idOrAddr.trim();
  if (s.startsWith("0x")) return s;
  const parts = s.split(".");
  const num = BigInt(parts[parts.length - 1]);
  return "0x" + num.toString(16).padStart(40, "0");
}

/**
 * Resolve a recipient ("0.0.x" or 0x…) to the EVM address the JSON-RPC relay
 * will accept. Accounts created from a MetaMask/ECDSA alias are addressed by
 * their ALIAS (mirror node `evm_address`), and the relay REJECTS transfers to
 * their long-zero form — so ask the mirror node first and only fall back to
 * long-zero for accounts without an alias (e.g. ED25519 accounts).
 */
async function resolveRecipientEvmAddress(idOrAddr: string): Promise<string> {
  const s = idOrAddr.trim();
  if (s.startsWith("0x")) return s;
  try {
    const res = await fetch(`https://mainnet-public.mirrornode.hedera.com/api/v1/accounts/${s}`);
    if (res.ok) {
      const data = await res.json();
      if (data.evm_address) return data.evm_address;
    }
  } catch {
    /* fall through to long-zero */
  }
  return toEvmAddress(s);
}

export default function TransferView() {
  const { address: evmAddress, isConnected } = useAppKitAccount();
  const { open } = useAppKit();
  const { walletProvider } = useAppKitProvider("eip155");
  const { hederaAccountId } = useHederaAccount(evmAddress || null);
  const hashconnectCtx = useHashConnect();

  // Two signing paths, same rule as Earn: EVM (Reown, ECDSA accounts) is
  // preferred; native HashPack (works for ED25519 accounts) is the fallback.
  const nativeAccountId = hashconnectCtx?.isConnected ? hashconnectCtx.hederaAccountId : null;
  const isNativeWallet = !isConnected && !!nativeAccountId;
  const walletConnected = isConnected || isNativeWallet;
  const accountId = isNativeWallet ? nativeAccountId : hederaAccountId;

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState<Token>(TOKEN_LIST[0]);
  const [isTokenSelectorOpen, setIsTokenSelectorOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // Smart Resolver States
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const { balance: hbarBalance } = useHederaBalance(accountId);
  const { liveBalances } = useTokenBalances(accountId);

  // Live USD prices (via our server-side proxy) for the token selector.
  const [prices, setPrices] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/prices");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !Array.isArray(data)) return;
        const map: Record<string, number> = {};
        for (const t of data) {
          const p = parseFloat(t.priceUsd ?? "0");
          if (t.symbol && p > 0) map[t.symbol] = p;
        }
        // HBAR and WHBAR are a 1:1 wrap; SaucerSwap lists only one of them.
        const hbarPrice = map["HBAR"] || map["WHBAR"] || 0;
        if (hbarPrice > 0) { map["HBAR"] = hbarPrice; map["WHBAR"] = hbarPrice; }
        setPrices(map);
      } catch {
        /* prices are cosmetic in the selector */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** Formatted balance for a token in the selector (matches the Amount row). */
  const balanceFor = (token: Token): number => {
    const raw = token.tokenId === "NATIVE" ? hbarBalance : (liveBalances[token.tokenId] || "0");
    return parseFloat(String(raw).replace(/,/g, "")) || 0;
  };

  // Smart Input Resolver
  useEffect(() => {
    const resolveInput = async () => {
      const input = recipient.trim();
      if (!input) {
        setResolvedAddress(null);
        setResolveError(null);
        setIsResolving(false);
        return;
      }

      setIsResolving(true);
      setResolveError(null);
      setResolvedAddress(null);

      // Check 1: Direct Hedera address
      if (/^0\.0\.\d+$/.test(input)) {
        setResolvedAddress(input);
        setIsResolving(false);
        return;
      }
      // Check 1b: Raw EVM address (MetaMask etc.)
      if (/^0x[0-9a-fA-F]{40}$/.test(input)) {
        setResolvedAddress(input);
        setIsResolving(false);
        return;
      }
      // Check 2: Supabase Global Profile Lookup
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('wallet_id')
          .ilike('velo_id', input) // Case-insensitive match
          .single();

        if (data && data.wallet_id) {
          console.log(`[Resolver] Found match in Supabase: ${input} -> ${data.wallet_id}`);
          setResolvedAddress(data.wallet_id);
        } else {
          console.log(`[Resolver] No match found in Supabase for ${input}`);
          if (error && error.code !== 'PGRST116') {
             console.error("[Resolver] Supabase error:", error);
          }
          setResolveError("Invalid address or Velo ID not found");
        }
      } catch (error) {
        console.error("[Resolver] Error querying Supabase:", error);
        setResolveError("Failed to resolve destination");
      }

      setIsResolving(false);
    };

    const debounceTimer = setTimeout(resolveInput, 600);
    return () => clearTimeout(debounceTimer);
  }, [recipient]);

  const currentBalance = selectedToken.tokenId === "NATIVE" 
    ? parseFloat(hbarBalance.replace(/,/g, "")) || 0
    : parseFloat(liveBalances[selectedToken.tokenId]?.replace(/,/g, "") || "0");
  const grossAmount = parseFloat(amount || "0");
  // Protocol fee is disabled for wallet-native (EVM) transfers — a single EVM
  // transaction has one recipient, so the recipient receives the full amount.
  const networkFee = 0.005; // Estimated HBAR network fee
  const recipientReceives = grossAmount;

  const handleMax = () => {
    setAmount(currentBalance.toString());
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setRecipient(text);
      toast.success("Address pasted from clipboard");
    } catch (err) {
      toast.error("Failed to read from clipboard");
    }
  };

  const [recentRecipients, setRecentRecipients] = useState<{name: string, address: string}[]>([]);

  // Load recent recipients from Cloud (Supabase) + Fallback to localStorage
  useEffect(() => {
    if (!accountId) return;

    const loadRecipients = async () => {
      // 1. Try Cloud First
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('recent_recipients')
          .eq('wallet_id', accountId)
          .single();
        
        if (data?.recent_recipients && Array.isArray(data.recent_recipients)) {
          console.log("[Cloud] Loaded recent recipients from Supabase");
          setRecentRecipients(data.recent_recipients);
          // Sync to local storage as backup
          localStorage.setItem(`recent_recipients_${accountId}`, JSON.stringify(data.recent_recipients));
          return;
        }
      } catch (err) {
        console.error("[Cloud] Failed to load from Supabase:", err);
      }

      // 2. Fallback to Local Storage
      const stored = localStorage.getItem(`recent_recipients_${accountId}`);
      if (stored) {
        try {
          setRecentRecipients(JSON.parse(stored));
        } catch (e) {
          console.error("Failed to parse recent recipients", e);
        }
      }
    };

    loadRecipients();
  }, [accountId]);

  const saveRecentRecipient = async (name: string, address: string) => {
    if (!accountId) return;
    const newRecipient = { name, address };
    
    // Calculate updated list
    const filtered = recentRecipients.filter(r => r.address !== address && r.name !== name);
    const updated = [newRecipient, ...filtered].slice(0, 5); // Keep last 5
    
    setRecentRecipients(updated);
    
    // 1. Save to Local Storage (Immediate feedback)
    localStorage.setItem(`recent_recipients_${accountId}`, JSON.stringify(updated));

    // 2. Save to Cloud (Supabase)
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({ 
          wallet_id: accountId, 
          recent_recipients: updated 
        }, { onConflict: 'wallet_id' });

      if (error) {
        console.error("[Cloud] Error saving to Supabase:", error.message);
      } else {
        console.log("[Cloud] Successfully synced recent recipients to Supabase");
      }
    } catch (err) {
      console.error("[Cloud] Sync failed:", err);
    }
  };

  const executeTransfer = async () => {
    if (!accountId || !resolvedAddress || isSending) return;
    if (!isNativeWallet && !walletProvider) {
      toast.error("Wallet not connected");
      return;
    }
    setIsSending(true);

    try {
      const isNative = selectedToken.tokenId === "NATIVE";

      let txHash: string | undefined;

      if (isNativeWallet) {
        // Native HashPack path (ED25519-compatible): one TransferTransaction,
        // recipient addressed by Hedera account id.
        const sender = AccountId.fromString(accountId);
        const hcSigner = hashconnectCtx!.hashconnect.getSigner(sender as any);
        const recipientId = await resolveRecipientAccountId(resolvedAddress);
        if (!recipientId) {
          throw new Error("Recipient has no Hedera account yet — ask them to fund their address first.");
        }
        const to = AccountId.fromString(recipientId);

        const tx = new TransferTransaction();
        if (isNative) {
          const tinybars = Math.round(grossAmount * 1e8);
          tx.addHbarTransfer(sender, Hbar.fromTinybars(-tinybars))
            .addHbarTransfer(to, Hbar.fromTinybars(tinybars));
        } else {
          const raw = ethers.parseUnits(grossAmount.toString(), selectedToken.decimals);
          const tid = TokenId.fromString(selectedToken.tokenId);
          tx.addTokenTransfer(tid, sender, Long.fromString((-raw).toString()))
            .addTokenTransfer(tid, to, Long.fromString(raw.toString()));
        }
        tx.setNodeAccountIds(await fetchLiveNodeAccountIds())
          .setTransactionId(TransactionId.generate(sender))
          .freeze();
        const resp = await tx.executeWithSigner(hcSigner as any);
        // Plain crypto transfers have no EVM hash; the Hedera tx id is the
        // unique reference for XP dedup.
        txHash = resp.transactionId.toString();
      } else {
        const browserProvider = new ethers.BrowserProvider(walletProvider as any);
        const signer = await browserProvider.getSigner();
        const toAddress = await resolveRecipientEvmAddress(resolvedAddress);

        if (isNative) {
          // Native HBAR transfer. On the Hedera JSON-RPC relay, msg.value is in
          // weibars (1 HBAR = 1e18), so parseEther gives the correct value.
          const tx = await signer.sendTransaction({
            to: toAddress,
            value: ethers.parseEther(grossAmount.toString()),
            gasLimit: 100000,
          });
          txHash = await waitForReceiptWithTimeout(tx);
        } else {
          // HTS token transfer via the token's ERC20 interface at its EVM address.
          if (!selectedToken.evmAddress) throw new Error(`${selectedToken.symbol} is missing an EVM address`);
          const amountRaw = ethers.parseUnits(grossAmount.toString(), selectedToken.decimals);
          const tokenContract = new ethers.Contract(selectedToken.evmAddress, ERC20_TRANSFER_ABI, signer);
          const tx = await tokenContract.transfer(toAddress, amountRaw, { gasLimit: 900000 });
          txHash = await waitForReceiptWithTimeout(tx);
        }
      }

      saveRecentRecipient(recipient, resolvedAddress);

      // Award Velo XP for this transfer (deduped by tx id server-side) and
      // surface the earned amount in the success toast.
      let xpNote = "";
      try {
        const xpRes = await fetch("/api/xp/reward", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: evmAddress || accountId, eventType: "transfer", refId: txHash }),
        });
        const xpData = await xpRes.json();
        if (xpData?.success && xpData.xpAwarded) xpNote = `, earned ${xpData.xpAwarded} XP ⚡`;
      } catch (e) {
        console.error("XP reward (transfer) failed:", e);
      }

      toast.success(`Successful${xpNote}`, {
        description: `Sent ${recipientReceives.toFixed(2)} ${selectedToken.symbol} to ${resolvedAddress}`,
      });

      setIsReviewModalOpen(false);
      setAmount("");
      setRecipient("");
      setResolvedAddress(null);
    } catch (error: any) {
      console.error("Transfer failed:", error);
      const rejected = error?.code === "ACTION_REJECTED" || /reject|denied/i.test(error?.message || "");
      toast.error(rejected ? "Transaction declined" : "Transfer failed", {
        description: rejected ? undefined : error?.message,
      });
    } finally {
      setIsSending(false);
    }
  };

  const isReady = parseFloat(amount) > 0 && resolvedAddress !== null && !isResolving && !resolveError;

  return (
    <div className="space-y-6">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-black tracking-tight text-white flex items-center justify-center gap-3">
            Transfer <span className="text-velo-cyan">Assets</span>
          </h1>
          <p className="text-gray-400 text-sm font-medium">
            Send tokens instantly on the Hedera network.
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-[#121826]/80 border border-white/5 rounded-[32px] p-6 shadow-2xl backdrop-blur-xl space-y-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-velo-cyan/50 to-transparent" />
          
          {/* Recipient Section */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">Send to</label>
            <div className="relative group">
              <input 
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Enter Velo ID or Hedera Address (0.0.x)"
                className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 px-5 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-velo-cyan/30 transition-all group-hover:border-white/10"
              />
              <button 
                onClick={handlePaste}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-velo-cyan transition-all"
              >
                <Clipboard size={18} />
              </button>
            </div>

            {/* Resolution Status */}
            <div className="h-5 flex items-center ml-2">
              {isResolving ? (
                <div className="flex items-center gap-1.5 text-gray-500">
                  <div className="w-3 h-3 border-2 border-velo-cyan border-t-transparent rounded-full animate-spin" />
                  <span className="text-[10px] font-medium">Resolving...</span>
                </div>
              ) : resolveError && recipient.length > 0 ? (
                <span className="text-[10px] font-medium text-red-400">{resolveError}</span>
              ) : resolvedAddress && resolvedAddress !== recipient.trim() ? (
                <div className="flex items-center gap-1.5 text-velo-green">
                  <Check size={12} />
                  <span className="text-[10px] font-medium font-mono">Resolved: {resolvedAddress}</span>
                </div>
              ) : null}
            </div>

            {/* Recent Contacts */}
            <div className="flex items-center gap-3 pt-2 overflow-hidden">
              <span className="text-[10px] font-bold text-gray-600 uppercase flex-shrink-0">Recent:</span>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide no-scrollbar flex-grow">
                {recentRecipients.length > 0 ? (
                  recentRecipients.map((r, idx) => (
                    <button
                      key={idx}
                      onClick={() => setRecipient(r.name)}
                      className="text-[10px] font-black text-velo-cyan bg-velo-cyan/10 px-3 py-1.5 rounded-xl hover:bg-velo-cyan/20 transition-all whitespace-nowrap border border-velo-cyan/10"
                    >
                      {r.name}
                    </button>
                  ))
                ) : (
                  <span className="text-[10px] font-medium text-gray-500 italic py-1.5">No recent transfers</span>
                )}
              </div>
            </div>
          </div>

          {/* Amount Section */}
          <div className="space-y-3">
            <div className="flex justify-between items-end ml-1">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Amount</label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-500 tracking-tight">Available: {currentBalance.toLocaleString()} {selectedToken.symbol}</span>
                <button 
                  onClick={handleMax}
                  className="text-[10px] font-black text-velo-cyan bg-velo-cyan/10 px-2 py-0.5 rounded-md hover:bg-velo-cyan/20 transition-all uppercase"
                >
                  MAX
                </button>
              </div>
            </div>

            <div className="bg-black/40 border border-white/5 rounded-3xl p-5 flex items-center justify-between group focus-within:ring-2 focus-within:ring-velo-cyan/30 transition-all">
              <input
                type="number"
                min="0"
                value={amount}
                onKeyDown={(e) => { if (e.key === "-" || e.key === "e" || e.key === "E") e.preventDefault(); }}
                onChange={(e) => {
                  // Never allow negative values (typed or via the spinner arrows).
                  const v = e.target.value;
                  if (v === "" || parseFloat(v) >= 0) setAmount(v.replace(/^-/, ""));
                }}
                placeholder="0.00"
                className="bg-transparent text-3xl font-black text-white focus:outline-none w-full placeholder:text-gray-800"
              />
              
              {/* Token Selector */}
              <button 
                onClick={() => setIsTokenSelectorOpen(true)}
                className="flex items-center gap-2 bg-[#1a2130] hover:bg-[#232d42] transition-all rounded-2xl px-3 py-2 border border-white/5 group min-w-[110px] justify-between"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full overflow-hidden bg-black flex items-center justify-center">
                    <img src={selectedToken.logoURI} alt={selectedToken.symbol} className="w-full h-full object-contain" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-white tracking-wide leading-none">{selectedToken.symbol}</p>
                    <p className="text-[8px] text-gray-500 font-medium">Token</p>
                  </div>
                </div>
                <ChevronDown size={14} className="text-gray-500 group-hover:text-white transition-colors" />
              </button>
            </div>
          </div>

          {/* Fee Breakdown */}
          <div className="bg-black/40 rounded-2xl p-4 border border-white/5 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500 font-medium">Protocol Fee</span>
              <span className="text-velo-green font-mono">Free</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500 font-medium">Estimated Network Fee</span>
              <span className="text-white font-mono">~{networkFee} HBAR</span>
            </div>
            <div className="h-px bg-white/5 my-1" />
            <div className="flex justify-between items-center">
              <span className="text-xs font-black text-velo-cyan uppercase tracking-wider">Recipient Receives</span>
              <span className="text-sm font-black text-white">{recipientReceives.toFixed(2)} {selectedToken.symbol}</span>
            </div>
          </div>

          {/* Action Button */}
          <button
            disabled={walletConnected && !isReady}
            onClick={walletConnected ? () => setIsReviewModalOpen(true) : () => open()}
            className={`w-full py-5 rounded-2xl font-black text-lg tracking-widest uppercase transition-all shadow-xl
              ${(!walletConnected || isReady)
                ? "bg-velo-cyan text-slate-950 hover:scale-[1.02] hover:shadow-velo-cyan/20 active:scale-[0.98]"
                : "bg-white/5 text-gray-600 cursor-not-allowed"
              }`}
          >
            {walletConnected ? "Review Transfer" : "Connect Wallet"}
          </button>

          {/* Native HashPack pairing — the path for ED25519 accounts, which the
              EVM connect modal can't serve. */}
          {!walletConnected && (
            <button
              onClick={() => hashconnectCtx?.connect()}
              className="w-full text-xs text-gray-400 hover:text-velo-cyan font-bold py-1 transition-colors"
            >
              Using an ED25519 HashPack account? Connect natively →
            </button>
          )}

          {isNativeWallet && (
            <div className="text-[10px] text-gray-500 text-center flex items-center justify-center gap-2">
              <span>Connected natively via HashPack · {accountId}</span>
              <button
                onClick={() => hashconnectCtx?.disconnect()}
                className="text-rose-400 hover:text-rose-300 font-bold uppercase tracking-wide transition-colors"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Review Modal */}
      {isReviewModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsReviewModalOpen(false)} />
          <div className="bg-[#0c1019] border border-white/10 rounded-[40px] w-full max-w-md p-8 relative shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="space-y-8">
              {/* Modal Header */}
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-velo-cyan/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-velo-cyan/20">
                  <Send className="text-velo-cyan" size={28} />
                </div>
                <h2 className="text-2xl font-black text-white tracking-tight">Review Transaction</h2>
                <p className="text-gray-500 text-xs font-medium">Please verify the details before sending.</p>
              </div>

              {/* Transaction Details */}
              <div className="space-y-6">
                <div className="space-y-2 text-center">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">You are sending</p>
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-4xl font-black text-white">{amount}</span>
                    <span className="text-2xl font-black text-velo-cyan">{selectedToken.symbol}</span>
                  </div>
                </div>

                <div className="bg-black/30 rounded-3xl p-5 border border-white/5 space-y-4">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Recipient</p>
                    <p className="text-sm font-mono text-white break-all bg-white/5 p-2 rounded-xl border border-white/5">{resolvedAddress}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Protocol Fee</p>
                      <p className="text-xs font-bold text-velo-green">Free</p>
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Net to Recipient</p>
                      <p className="text-xs font-bold text-velo-cyan">{recipientReceives.toFixed(4)} {selectedToken.symbol}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setIsReviewModalOpen(false)}
                  className="py-4 rounded-2xl font-black text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 transition-all border border-white/5"
                >
                  Cancel
                </button>
                <button 
                  disabled={isSending}
                  onClick={executeTransfer}
                  className={`py-4 rounded-2xl font-black text-slate-950 transition-all shadow-lg flex items-center justify-center gap-2 ${isSending ? 'bg-velo-cyan/50 cursor-not-allowed' : 'bg-velo-cyan hover:bg-cyan-300 shadow-velo-cyan/20'}`}
                >
                  {isSending ? (
                    <>
                      <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      Confirm & Send
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Token Selector Modal */}
      {isTokenSelectorOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setIsTokenSelectorOpen(false)} />
          <div className="bg-[#121826] border border-white/10 rounded-[32px] w-full max-w-sm overflow-hidden relative shadow-2xl">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-black text-white uppercase tracking-widest text-sm">Select Token</h3>
              <button onClick={() => setIsTokenSelectorOpen(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <div className="max-h-[400px] overflow-y-auto p-2 space-y-1">
              {TOKEN_LIST.map((token) => {
                const bal = balanceFor(token);
                const usd = bal * (prices[token.symbol] || 0);
                return (
                  <button
                    key={token.tokenId}
                    onClick={() => {
                      setSelectedToken(token);
                      setIsTokenSelectorOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all ${selectedToken.tokenId === token.tokenId ? "bg-velo-cyan/10 border border-velo-cyan/30" : "hover:bg-white/5 border border-transparent"}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-black flex items-center justify-center">
                        <img src={token.logoURI} alt={token.symbol} className="w-full h-full object-contain" />
                      </div>
                      <div className="text-left">
                        <p className="font-black text-white flex items-center gap-2">
                          {token.symbol}
                          {selectedToken.tokenId === token.tokenId && <Check size={14} className="text-velo-cyan" />}
                        </p>
                        <p className="text-[10px] text-gray-500">{token.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-white">
                        {bal.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </p>
                      <p className="text-[11px] font-bold text-velo-cyan/60">
                        {usd > 0 ? `$${usd.toFixed(2)}` : "—"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
