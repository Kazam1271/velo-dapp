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
import { STAKING_VAULT, VAULT_ABI } from "@/config/contracts";

// Staking pays Velo XP ONLY — funds are held by the non-custodial
// VeloStakingVault contract; unstaking is an on-chain tx that returns the
// staker's HBAR directly. Keep the rate in sync with api/xp/stake-accrual.
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

/** Read the caller's staked balance straight from the vault (mirror node). */
async function fetchVaultStake(userEvm: string): Promise<number> {
  try {
    const iface = new ethers.Interface(VAULT_ABI);
    const res = await fetch("https://mainnet-public.mirrornode.hedera.com/api/v1/contracts/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: STAKING_VAULT, data: iface.encodeFunctionData("stakedOf", [userEvm]) }),
    });
    if (!res.ok) return 0;
    const out = await res.json();
    return out.result ? Number(BigInt(out.result)) / 1e8 : 0;
  } catch {
    return 0;
  }
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
  // Unstake modal state
  const [unstakeStake, setUnstakeStake] = useState<any | null>(null);
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [isUnstaking, setIsUnstaking] = useState(false);
  // On-chain staked balance (authoritative — read from the vault contract)
  const [vaultStaked, setVaultStaked] = useState(0);

  const refreshVaultStake = async () => {
    if (evmAddress) setVaultStaked(await fetchVaultStake(evmAddress));
  };
  useEffect(() => {
    refreshVaultStake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evmAddress]);

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

      toast.loading("Staking into the vault contract...", { id: toastId });

      // Non-custodial: HBAR is held by the verified VeloStakingVault contract.
      // msg.value is in weibars (1 HBAR = 1e18) on the relay.
      const vault = new ethers.Contract(STAKING_VAULT, VAULT_ABI, signer);
      const tx = await vault.stake({
        value: ethers.parseEther(stakeAmount),
        gasLimit: 200000,
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
      refreshVaultStake();
      fetchStakes();

    } catch (error: any) {
      console.error("[Stake Error]:", error);
      toast.error("Stake Failed", { id: toastId, description: error.message });
    } finally {
      setIsStaking(false);
    }
  };

  const handleUnstake = async () => {
    if (!isConnected || !userAddress || !walletProvider || !unstakeStake) return;
    const requested = parseFloat(unstakeAmount);
    const maxAvailable = Math.min(Number(unstakeStake.amount), vaultStaked || Number(unstakeStake.amount));
    if (!(requested > 0) || requested > maxAvailable + 1e-9) {
      toast.error("Enter a valid amount within your stake.");
      return;
    }

    setIsUnstaking(true);
    const toastId = toast.loading("Confirm the unstake transaction in your wallet...");

    try {
      // Non-custodial: the vault contract pays the caller back directly —
      // one on-chain transaction, no server involvement in the funds.
      const browserProvider = new ethers.BrowserProvider(walletProvider as any);
      const signer = await browserProvider.getSigner();
      const vault = new ethers.Contract(STAKING_VAULT, VAULT_ABI, signer);
      // Vault amounts are tinybars (8 decimals).
      const tx = await vault.unstake(ethers.parseUnits(requested.toFixed(8), 8), { gasLimit: 200000 });

      toast.loading("Unstaking on-chain...", { id: toastId });
      const txHash = await waitForReceiptWithTimeout(tx);

      // Sync the stake records (drives daily XP) from the on-chain event.
      fetch("/api/unstake-record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash, accountId: userAddress }),
      }).catch(() => {});

      toast.success(`Unstaked ${requested} HBAR — back in your wallet.`, { id: toastId });
      setUnstakeStake(null);
      setUnstakeAmount("");
      refreshBalance();
      refreshVaultStake();
      setTimeout(fetchStakes, 2500);
    } catch (err: any) {
      const rejected = err?.code === "ACTION_REJECTED" || /rejected|denied/i.test(err?.message || "");
      toast.error(rejected ? "Transaction declined" : "Unstake Failed", { id: toastId, description: rejected ? undefined : err.message });
    } finally {
      setIsUnstaking(false);
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
        <p className="text-gray-400 text-sm">Lock your HBAR to earn daily Velo XP. Unstake anytime — your HBAR comes straight back.</p>
      </motion.div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 mb-2">
        <div className="bg-velo-card border border-velo-border rounded-2xl p-4 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-velo-cyan/10 rounded-full blur-xl -mr-8 -mt-8"></div>
          <span className="text-xs text-gray-400 font-bold tracking-wider mb-1">DAILY XP</span>
          <span className="text-2xl font-bold text-velo-cyan">{XP_PER_10_HBAR_PER_DAY} <span className="text-xs text-gray-400">/ 10 HBAR</span></span>
        </div>
        <div className="bg-velo-card border border-velo-border rounded-2xl p-4 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-velo-green/10 rounded-full blur-xl -mr-8 -mt-8"></div>
          <span className="text-xs text-gray-400 font-bold tracking-wider mb-1">REWARDS PAID IN</span>
          <span className="text-2xl font-bold text-velo-green">Velo XP</span>
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
                      onClick={() => { setUnstakeStake(stake); setUnstakeAmount(String(stake.amount)); }}
                      className="bg-velo-cyan/10 hover:bg-velo-cyan/20 text-velo-cyan text-xs font-bold py-1.5 px-3 rounded-lg transition-colors"
                    >
                      UNSTAKE
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Unstake Modal */}
      {unstakeStake && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isUnstaking && setUnstakeStake(null)} />
          <div className="bg-[#0c1019] border border-white/10 rounded-[32px] w-full max-w-sm p-6 relative shadow-2xl">
            <h3 className="text-lg font-black text-white mb-1">Unstake HBAR</h3>
            <p className="text-xs text-gray-500 mb-4">
              Staked: <span className="text-velo-cyan font-bold">{unstakeStake.amount} HBAR</span> — choose how much to withdraw.
            </p>

            <div className="bg-black/40 border border-white/5 rounded-2xl p-4 mb-2 flex items-center justify-between gap-3">
              <input
                type="number"
                min="0"
                value={unstakeAmount}
                onKeyDown={(e) => { if (e.key === "-" || e.key === "e" || e.key === "E") e.preventDefault(); }}
                onChange={(e) => { const v = e.target.value; if (v === "" || parseFloat(v) >= 0) setUnstakeAmount(v.replace(/^-/, "")); }}
                placeholder="0.00"
                className="bg-transparent text-2xl font-black text-white focus:outline-none w-full"
              />
              <button
                onClick={() => setUnstakeAmount(String(unstakeStake.amount))}
                className="text-[10px] font-black text-velo-cyan bg-velo-cyan/10 px-2 py-1 rounded-md hover:bg-velo-cyan/20 uppercase"
              >
                MAX
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mb-4">
              One on-chain transaction — the vault contract sends your HBAR straight back to your wallet.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setUnstakeStake(null)}
                disabled={isUnstaking}
                className="py-3 rounded-xl font-black text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 transition-all border border-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handleUnstake}
                disabled={isUnstaking || !(parseFloat(unstakeAmount) > 0) || parseFloat(unstakeAmount) > Number(unstakeStake.amount) + 1e-9}
                className="py-3 rounded-xl font-black text-slate-950 bg-velo-cyan hover:bg-cyan-300 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
              >
                {isUnstaking ? <Loader2 size={16} className="animate-spin" /> : "Sign & Unstake"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
