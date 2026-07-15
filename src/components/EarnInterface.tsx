"use client";

import { RefreshCw, Loader2, Coins, Zap } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { ethers } from "ethers";
import { useHederaBalance } from "@/hooks/useHederaBalance";
import { useHederaAccount } from "@/hooks/useHederaAccount";
import { useAppKitAccount, useAppKit, useAppKitProvider } from "@reown/appkit/react";
import { useHCSData } from "@/contexts/HCSDataProvider";

// Mainnet treasury — the account MAINNET_TREASURY_KEY controls (0xc2d7…251c).
// (The previous value 0.0.8642596 was the TESTNET treasury id, which on
// mainnet belongs to a stranger — stakes would have been lost.)
const TREASURY_ID = "0.0.10609462";

// Displayed staking economics — keep in sync with api/claim-rewards (APY)
// and api/xp/stake-accrual (XP rate).
const STAKE_APY_PCT = 5;
const XP_PER_10_HBAR_PER_DAY = 1;

/**
 * Wait for a tx receipt with a timeout — Hedera's JSON-RPC relay is often slow
 * to return receipts even after the transaction has succeeded on-chain. On
 * timeout, resolve with the submitted hash (the tx was already broadcast).
 */
async function waitForReceiptWithTimeout(tx: { hash: string; wait: () => Promise<any> }, timeoutMs = 15000): Promise<string> {
  try {
    const receipt = await Promise.race([
      tx.wait(),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return (receipt as any)?.hash || tx.hash;
  } catch {
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
 * Resolve an account to the EVM address the relay accepts: alias accounts
 * (MetaMask/ECDSA) must be addressed by their mirror-node `evm_address`;
 * long-zero only works for accounts without an alias.
 */
async function resolveEvmAddress(idOrAddr: string): Promise<string> {
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

export default function EarnPage() {
  const { address: evmAddress, isConnected } = useAppKitAccount();
  const { open } = useAppKit();
  const { walletProvider } = useAppKitProvider("eip155");
  const { hederaAccountId } = useHederaAccount(evmAddress || null);
  const userAddress = hederaAccountId;
  const { balance, isLoading: isRefreshingBalance, refresh: refreshBalance } = useHederaBalance(userAddress);
  const { pushAction } = useHCSData();

  const [isStaking, setIsStaking] = useState(false);
  const [stakeAmount, setStakeAmount] = useState("");
  const [activeStakes, setActiveStakes] = useState<any[]>([]);
  const [isFetchingStakes, setIsFetchingStakes] = useState(false);

  useEffect(() => {
    if (isConnected && userAddress) {
      fetchStakes();
      // Accrue any pending daily stake-XP (idempotent server-side).
      fetch("/api/xp/stake-accrual", { method: "POST" }).catch(() => {});
    } else {
      setActiveStakes([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!isConnected || !userAddress || !walletProvider || !stakeAmount || parseFloat(stakeAmount) <= 0) return;

    setIsStaking(true);
    const toastId = toast.loading("Initializing Stake...");

    try {
      const browserProvider = new ethers.BrowserProvider(walletProvider as any);
      const signer = await browserProvider.getSigner();
      const treasuryAddress = await resolveEvmAddress(TREASURY_ID);

      toast.loading("Depositing HBAR to Vault...", { id: toastId });

      // Native HBAR deposit — msg.value is in weibars (1 HBAR = 1e18) on the relay.
      const tx = await signer.sendTransaction({
        to: treasuryAddress,
        value: ethers.parseEther(stakeAmount),
        gasLimit: 100000,
      });
      const txHash = await waitForReceiptWithTimeout(tx);
      if (!txHash) throw new Error("Deposit failed.");

      toast.loading("Securing stake in cloud database...", { id: toastId });

      const saveRes = await fetch("/api/save-stake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userAddress,
          stakingTxId: txHash,
          amount: parseFloat(stakeAmount),
          timestamp: Date.now(),
          tokenId: "NATIVE"
        })
      });

      if (!saveRes.ok) throw new Error("Failed to save stake record.");

      // Award 100 Velo XP for the stake transaction (deduped by tx id server-side).
      fetch("/api/xp/reward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: evmAddress || userAddress,
          eventType: "stake",
          refId: txHash,
        }),
      }).catch((e) => console.error("XP reward (stake) failed:", e));

      toast.success("Successfully Staked!", { id: toastId });
      pushAction("staked", "HBAR", stakeAmount);

      setStakeAmount("");
      refreshBalance();
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

      toast.success(`Claimed successfully! Earned ${data.rewardEarned.toFixed(4)} HBAR.`, { id: toastId });
      refreshBalance();
      fetchStakes();
    } catch (err: any) {
      toast.error("Claim Failed", { id: toastId, description: err.message });
    }
  };

  const balanceNum = parseFloat(String(balance).replace(/,/g, "")) || 0;
  const dailyXpPreview = stakeAmount && parseFloat(stakeAmount) > 0
    ? Math.floor((parseFloat(stakeAmount) / 10) * XP_PER_10_HBAR_PER_DAY)
    : 0;

  return (
    <div className="w-full max-w-md mx-auto mt-8 flex flex-col gap-4 mb-24">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-2">
        <h1 className="text-3xl font-bold text-white mb-2">HBAR Staking Vault</h1>
        <p className="text-gray-400 text-sm">Lock your HBAR in the Treasury to earn rewards and daily Velo XP.</p>
      </motion.div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 mb-2">
        <div className="bg-velo-card border border-velo-border rounded-2xl p-4 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-velo-green/10 rounded-full blur-xl -mr-8 -mt-8"></div>
          <span className="text-xs text-gray-400 font-bold tracking-wider mb-1">APY</span>
          <span className="text-2xl font-bold text-velo-green">{STAKE_APY_PCT}%</span>
        </div>
        <div className="bg-velo-card border border-velo-border rounded-2xl p-4 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-velo-cyan/10 rounded-full blur-xl -mr-8 -mt-8"></div>
          <span className="text-xs text-gray-400 font-bold tracking-wider mb-1">DAILY XP</span>
          <span className="text-2xl font-bold text-velo-cyan">{XP_PER_10_HBAR_PER_DAY} <span className="text-xs text-gray-400">/ 10 HBAR</span></span>
        </div>
      </div>

      <div className="bg-velo-card border border-velo-border rounded-3xl p-6 shadow-2xl relative">
        <div className="bg-[#0b0e14] rounded-2xl p-4 border border-velo-border mb-4">
          <div className="text-sm text-gray-400 mb-2">Stake Amount</div>
          <div className="flex items-center justify-between gap-4">
            <input
              type="text"
              placeholder="0.00"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              className="bg-transparent text-4xl w-full outline-none text-white font-medium"
            />
            {/* HBAR is the only stakeable asset for now — no token selector */}
            <div className="flex items-center gap-2 bg-[#1a2130] rounded-2xl px-4 py-2 border border-velo-border min-w-[110px] justify-center">
              <div className="w-6 h-6 rounded-full overflow-hidden bg-black flex items-center justify-center">
                <img src="/hbar.png" alt="HBAR" className="w-full h-full object-contain" />
              </div>
              <span className="text-white font-bold text-sm tracking-wide">HBAR</span>
            </div>
          </div>
          <div className="flex justify-between items-center text-sm text-gray-400 mt-5 px-1">
            <div className="flex items-center gap-2">
              <span>Balance:</span>
              <span className="text-velo-cyan">{balance} HBAR</span>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStakeAmount((balanceNum * 0.5).toFixed(2))} className="hover:text-velo-cyan text-[10px] font-bold">50%</button>
              <button onClick={() => setStakeAmount(Math.max(balanceNum - 1, 0).toFixed(2))} className="hover:text-velo-cyan text-[10px] font-bold">MAX</button>
            </div>
          </div>
        </div>

        {/* Daily XP preview */}
        <div className="bg-velo-cyan/5 border border-velo-cyan/20 rounded-2xl px-4 py-3 mb-4 flex items-center gap-3">
          <Zap size={16} className="text-velo-cyan shrink-0" />
          <span className="text-xs text-gray-300">
            {dailyXpPreview > 0
              ? <>You&apos;ll earn <span className="text-velo-cyan font-bold">{dailyXpPreview} XP every day</span> while this stake is active.</>
              : <>Earn <span className="text-velo-cyan font-bold">{XP_PER_10_HBAR_PER_DAY} XP per day</span> for every 10 HBAR staked.</>}
          </span>
        </div>

        <button
          onClick={isConnected ? handleStake : () => open()}
          disabled={isConnected && (isStaking || !stakeAmount || parseFloat(stakeAmount) <= 0 || parseFloat(stakeAmount) > balanceNum)}
          className="w-full bg-velo-green hover:bg-green-500 disabled:opacity-40 text-[#0b0e14] text-lg font-bold py-4 rounded-xl transition-all glow-green mb-6 flex items-center justify-center gap-3"
        >
          {isStaking
            ? <Loader2 size={20} className="animate-spin" />
            : !isConnected
              ? "CONNECT WALLET"
              : stakeAmount && parseFloat(stakeAmount) > balanceNum
                ? "INSUFFICIENT HBAR"
                : "STAKE HBAR"}
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
                const days = ((Date.now() - stake.timestamp) / (1000 * 60 * 60 * 24)).toFixed(1);
                const xpPerDay = Math.floor((stake.amount / 10) * XP_PER_10_HBAR_PER_DAY);

                return (
                  <div key={stake.id} className="bg-black/40 border border-white/5 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <div className="text-white font-bold text-sm">{stake.amount} HBAR</div>
                      <div className="text-[10px] text-gray-500">Staked {days} days ago{xpPerDay > 0 ? ` · +${xpPerDay} XP/day` : ""}</div>
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
