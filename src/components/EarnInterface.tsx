"use client";

import { ArrowUpDown, ChevronDown, Info, TrendingUp, ShieldCheck, RefreshCw, Loader2, Coins } from "lucide-react";
import { useRef, useState, useEffect, useMemo } from "react";
import { useHashConnect } from "@/contexts/HashConnectProvider";
import { TOKEN_LIST, Token } from "@/config/tokens";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { 
  TransferTransaction, 
  Hbar, 
  AccountId, 
  TokenId,
  TokenAssociateTransaction
} from "@hiero-ledger/sdk";
import { useHCSData } from "@/contexts/HCSDataProvider";

const TREASURY_ID = "0.0.8642596";

export default function EarnPage() {
  const { hashconnect, pairingData, isConnected, balance, isRefreshingBalance } = useHashConnect();
  const userAddress = isConnected && pairingData ? pairingData.accountIds[0] : null;

  const [isStaking, setIsStaking] = useState(false);
  const [stakeAmount, setStakeAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState<Token>(TOKEN_LIST[0]); // Default HBAR
  
  const { liveBalances, isFetching: isFetchingBalances, refresh: refreshBalances } = useTokenBalances(userAddress);
  const { pushAction } = useHCSData();

  const [activeStakes, setActiveStakes] = useState<any[]>([]);
  const [isFetchingStakes, setIsFetchingStakes] = useState(false);

  const isAssociated = useMemo(() => {
    if (selectedToken.tokenId === "NATIVE") return true;
    return liveBalances[selectedToken.tokenId] !== undefined;
  }, [selectedToken, liveBalances]);

  useEffect(() => {
    if (isConnected && userAddress) {
      fetchStakes();
    } else {
      setActiveStakes([]);
    }
  }, [isConnected, userAddress]);

  const fetchStakes = async () => {
    if (!userAddress) return;
    setIsFetchingStakes(true);
    try {
      const res = await fetch(`/api/get-stakes?userId=${userAddress}`);
      const data = await res.json();
      if (data.success) {
        setActiveStakes(data.stakes);
      }
    } catch (err) {
      console.error("Failed to fetch stakes", err);
    } finally {
      setIsFetchingStakes(false);
    }
  };

  const handleStake = async () => {
    if (!isConnected || !userAddress || !hashconnect || !stakeAmount || parseFloat(stakeAmount) <= 0) return;

    setIsStaking(true);
    const toastId = toast.loading("Initializing Stake...");

    try {
      const signer = hashconnect.getSigner(AccountId.fromString(userAddress) as any) as any;

      if (!isAssociated && selectedToken.tokenId !== "NATIVE") {
        toast.loading(`Associating ${selectedToken.symbol}...`, { id: toastId });
        const associateTx = new TokenAssociateTransaction()
          .setAccountId(AccountId.fromString(userAddress))
          .setTokenIds([TokenId.fromString(selectedToken.tokenId)]);
        
        await (associateTx as any).freezeWithSigner(signer);
        await (associateTx as any).executeWithSigner(signer);
        refreshBalances();
      }

      toast.loading(`Depositing ${selectedToken.symbol} to Vault...`, { id: toastId });
      let depositTx = new TransferTransaction();

      if (selectedToken.tokenId === "NATIVE") {
        depositTx.addHbarTransfer(AccountId.fromString(userAddress), new Hbar(-parseFloat(stakeAmount)))
                 .addHbarTransfer(AccountId.fromString(TREASURY_ID), new Hbar(parseFloat(stakeAmount)));
      } else {
        const decimals = selectedToken.decimals || 6;
        const amountTiny = Math.floor(parseFloat(stakeAmount) * Math.pow(10, decimals));
        depositTx.addTokenTransfer(TokenId.fromString(selectedToken.tokenId), AccountId.fromString(userAddress), -amountTiny)
                 .addTokenTransfer(TokenId.fromString(selectedToken.tokenId), AccountId.fromString(TREASURY_ID), amountTiny);
      }

      await (depositTx as any).freezeWithSigner(signer);
      const depositResult = await (depositTx as any).executeWithSigner(signer);
      
      if (!depositResult || !depositResult.transactionId) throw new Error("Deposit failed.");

      toast.loading("Securing stake in cloud database...", { id: toastId });
      
      const saveRes = await fetch("/api/save-stake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userId: userAddress,
          stakingTxId: depositResult.transactionId.toString(),
          amount: parseFloat(stakeAmount),
          timestamp: Date.now(),
          tokenId: selectedToken.tokenId
        })
      });

      if (!saveRes.ok) throw new Error("Failed to save stake record.");

      toast.success("Successfully Staked!", { id: toastId });
      pushAction("staked", selectedToken.symbol, stakeAmount);
      
      setStakeAmount("");
      refreshBalances();
      fetchStakes();

    } catch (error: any) {
      console.error("[Stake Error]:", error);
      toast.error("Stake Failed", { id: toastId, description: error.message });
    } finally {
      setIsStaking(false);
    }
  };

  const handleClaim = async (stakeId: number) => {
    if (!isConnected || !userAddress) return;
    const toastId = toast.loading("Claiming Rewards & Unstaking...");
    
    try {
      const res = await fetch("/api/claim-rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stakeId, accountId: userAddress })
      });
      
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      toast.success(`Claimed successfully! Earned ${data.rewardEarned.toFixed(4)} reward.`, { id: toastId });
      refreshBalances();
      fetchStakes();
    } catch (err: any) {
      toast.error("Claim Failed", { id: toastId, description: err.message });
    }
  };

  const getTokenBalanceInfo = (token: Token) => {
    if (token.tokenId === "NATIVE") return { value: balance, isLoading: isRefreshingBalance };
    const val = liveBalances[token.tokenId];
    return { value: val ?? "0.00", isLoading: isFetchingBalances };
  };

  const balanceInfo = useMemo(() => getTokenBalanceInfo(selectedToken), [selectedToken, balance, isRefreshingBalance, liveBalances, isFetchingBalances]);
  const enrichedTokens = useMemo(() => TOKEN_LIST.map(t => ({ ...t, balance: getTokenBalanceInfo(t).value, isLoading: getTokenBalanceInfo(t).isLoading })), [TOKEN_LIST, liveBalances, balance]);

  return (
    <div className="w-full max-w-md mx-auto mt-8 flex flex-col gap-4 mb-24">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-2">
        <h1 className="text-3xl font-bold text-white mb-2">VELO Staking Vault</h1>
        <p className="text-gray-400 text-sm">Lock your tokens in the Treasury to earn protocol rewards.</p>
      </motion.div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 mb-2">
        <div className="bg-velo-card border border-velo-border rounded-2xl p-4 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-velo-green/10 rounded-full blur-xl -mr-8 -mt-8"></div>
          <span className="text-xs text-gray-400 font-bold tracking-wider mb-1">PROJECTED APY</span>
          <span className="text-2xl font-bold text-velo-green">12.5%</span>
        </div>
        <div className="bg-velo-card border border-velo-border rounded-2xl p-4 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-velo-cyan/10 rounded-full blur-xl -mr-8 -mt-8"></div>
          <span className="text-xs text-gray-400 font-bold tracking-wider mb-1">TOTAL STAKED</span>
          <span className="text-2xl font-bold text-white">4.2M+</span>
        </div>
      </div>

      <div className="bg-velo-card border border-velo-border rounded-3xl p-6 shadow-2xl relative">
        <div className="bg-[#0b0e14] rounded-2xl p-4 border border-velo-border mb-6">
          <div className="text-sm text-gray-400 mb-2">Stake Amount</div>
          <div className="flex items-center justify-between gap-4">
            <input
              type="text"
              placeholder="0.00"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              className="bg-transparent text-4xl w-full outline-none text-white font-medium"
            />
            <TokenDropdown selected={selectedToken} tokens={enrichedTokens} onSelect={setSelectedToken} />
          </div>
          <div className="flex justify-between items-center text-sm text-gray-400 mt-5 px-1">
            <div className="flex items-center gap-2">
              <span>Balance:</span>
              <span className="text-velo-cyan">{balanceInfo.value} {selectedToken.symbol}</span>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStakeAmount((parseFloat(balanceInfo.value.replace(/,/g, "")) * 0.5).toFixed(2))} className="hover:text-velo-cyan text-[10px] font-bold">50%</button>
              <button onClick={() => setStakeAmount(balanceInfo.value.replace(/,/g, ""))} className="hover:text-velo-cyan text-[10px] font-bold">MAX</button>
            </div>
          </div>
        </div>

        <button
          onClick={handleStake}
          disabled={!isConnected || isStaking || !stakeAmount || parseFloat(stakeAmount) <= 0}
          className="w-full bg-velo-green hover:bg-green-500 disabled:opacity-40 text-[#0b0e14] text-lg font-bold py-4 rounded-xl transition-all glow-green mb-6 flex items-center justify-center gap-3"
        >
          {isStaking ? <Loader2 size={20} className="animate-spin" /> : !isConnected ? "CONNECT WALLET" : "STAKE"}
        </button>

        {/* Active Stakes List */}
        <div className="border-t border-velo-border pt-4">
          <h3 className="text-sm font-bold text-gray-400 mb-3 flex items-center gap-2">
            <Coins size={14} /> Your Active Stakes
            {isFetchingStakes && <RefreshCw size={10} className="animate-spin ml-auto" />}
          </h3>
          
          {activeStakes.length === 0 ? (
            <div className="text-center py-4 bg-black/20 rounded-xl border border-white/5 text-xs text-gray-500">
              No active stakes found.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {activeStakes.map(stake => {
                const token = TOKEN_LIST.find(t => t.tokenId === stake.token_id) || TOKEN_LIST[0];
                const days = ((Date.now() - stake.timestamp) / (1000 * 60 * 60 * 24)).toFixed(1);
                
                return (
                  <div key={stake.id} className="bg-black/40 border border-white/5 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <div className="text-white font-bold text-sm">{stake.amount} {token.symbol}</div>
                      <div className="text-[10px] text-gray-500">Staked {days} days ago</div>
                    </div>
                    <button 
                      onClick={() => handleClaim(stake.id)}
                      className="bg-velo-cyan/10 hover:bg-velo-cyan/20 text-velo-cyan text-xs font-bold py-1.5 px-3 rounded-lg transition-colors"
                    >
                      CLAIM
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TokenDropdown({ selected, tokens, onSelect }: { selected: Token, tokens: any[], onSelect: (t: Token) => void }) {
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
            <button key={t.symbol} onClick={() => { onSelect(t); setIsOpen(false); }} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-all text-left">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-black p-1 flex items-center justify-center">
                  <img src={t.logoURI} alt={t.symbol} className="w-full h-full object-contain" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-1.5">{t.symbol}</div>
                  <div className="text-[10px] text-gray-500">{t.name}</div>
                </div>
              </div>
              <div className="text-right text-xs font-bold text-white">{t.balance}</div>
            </button>
          ))}
        </motion.div>
      )}
    </div>
  );
}
