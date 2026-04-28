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
import { useHashConnect } from "@/contexts/HashConnectProvider";
import { TOKEN_LIST, Token } from "@/config/tokens";
import { toast } from "sonner";
import { useHederaBalance } from "@/hooks/useHederaBalance";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { supabase } from "@/lib/supabase";
import { TransferTransaction, Hbar, TokenId, AccountId } from "@hiero-ledger/sdk";

export default function TransferView() {
  const { pairingData, hashconnect } = useHashConnect();
  const accountId = pairingData?.accountIds[0] || null;

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

      // Check 1: Direct Address
      if (/^0\.0\.\d+$/.test(input)) {
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
  const protocolFee = grossAmount * 0.0025;
  const networkFee = 0.005; // Mock HBAR fee
  const recipientReceives = grossAmount - protocolFee;

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

  const executeTransfer = async () => {
    if (!accountId || !resolvedAddress || isSending) return;
    setIsSending(true);

    try {
      const treasuryId = "0.0.12345"; // Hardcoded Velo Treasury
      let transaction = new TransferTransaction();
      const isNative = selectedToken.tokenId === "NATIVE";

      if (isNative) {
        // HBAR Logic
        const grossTiny = Math.floor(grossAmount * 100_000_000);
        const protocolTiny = Math.floor(protocolFee * 100_000_000);
        const netTiny = grossTiny - protocolTiny;

        transaction
          .addHbarTransfer(AccountId.fromString(accountId), Hbar.fromTinybars(-grossTiny))
          .addHbarTransfer(AccountId.fromString(resolvedAddress), Hbar.fromTinybars(netTiny))
          .addHbarTransfer(AccountId.fromString(treasuryId), Hbar.fromTinybars(protocolTiny));
      } else {
        // Custom HTS Token Logic
        const multiplier = Math.pow(10, selectedToken.decimals);
        const grossUnits = Math.floor(grossAmount * multiplier);
        const protocolUnits = Math.floor(protocolFee * multiplier);
        const netUnits = grossUnits - protocolUnits;
        const tokenId = TokenId.fromString(selectedToken.tokenId);

        transaction
          .addTokenTransfer(tokenId, AccountId.fromString(accountId), -grossUnits)
          .addTokenTransfer(tokenId, AccountId.fromString(resolvedAddress), netUnits)
          .addTokenTransfer(tokenId, AccountId.fromString(treasuryId), protocolUnits);
      }

      // @ts-ignore - Bypass TS mismatch between @hiero-ledger/sdk versions
      const signer = hashconnect.getSigner(AccountId.fromString(accountId));
      // @ts-ignore
      const frozenTx = await transaction.freezeWithSigner(signer);
      // @ts-ignore
      const res = await frozenTx.executeWithSigner(signer);

      if (res) {
        toast.success(`Successfully sent ${recipientReceives.toFixed(2)} ${selectedToken.symbol} to ${resolvedAddress}`);
      } else {
        toast.success(`Transfer initiated! Check your wallet.`);
      }

      setIsReviewModalOpen(false);
      setAmount("");
      setRecipient("");
      setResolvedAddress(null);
    } catch (error: any) {
      console.error("Transfer failed:", error);
      toast.error("Transaction failed or was rejected.");
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
            <div className="flex items-center gap-3 pt-2">
              <span className="text-[10px] font-bold text-gray-600 uppercase">Recent:</span>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide no-scrollbar">
                <span className="text-[10px] font-medium text-gray-500 italic py-1.5">No recent transfers</span>
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
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
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
              <span className="text-gray-500 font-medium">Protocol Fee (0.25%)</span>
              <span className="text-white font-mono">{protocolFee.toFixed(2)} {selectedToken.symbol}</span>
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
            disabled={!isReady}
            onClick={() => setIsReviewModalOpen(true)}
            className={`w-full py-5 rounded-2xl font-black text-lg tracking-widest uppercase transition-all shadow-xl
              ${isReady 
                ? "bg-velo-cyan text-slate-950 hover:scale-[1.02] hover:shadow-velo-cyan/20 active:scale-[0.98]" 
                : "bg-white/5 text-gray-600 cursor-not-allowed"
              }`}
          >
            Review Transfer
          </button>
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
                      <p className="text-xs font-bold text-gray-300">{protocolFee.toFixed(4)} {selectedToken.symbol}</p>
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
              {TOKEN_LIST.map((token) => (
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
                      <p className="font-black text-white">{token.symbol}</p>
                      <p className="text-[10px] text-gray-500">{token.name}</p>
                    </div>
                  </div>
                  {selectedToken.tokenId === token.tokenId && <Check size={18} className="text-velo-cyan" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
