"use client";

import { useEffect, useMemo, useState } from "react";
import { Trophy, Crown, Medal, Loader2, RefreshCw, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { useAppKitAccount } from "@reown/appkit/react";

interface LeaderRow {
  rank: number;
  wallet: string;
  displayName: string | null;
  xp: number;
  swaps: number;
}

function shortWallet(w: string) {
  if (!w) return "";
  if (w.startsWith("0x")) return `${w.slice(0, 6)}…${w.slice(-4)}`;
  return w;
}

function rankBadge(rank: number) {
  if (rank === 1) return { icon: <Crown size={16} />, cls: "bg-yellow-400/15 text-yellow-300 border-yellow-400/40" };
  if (rank === 2) return { icon: <Medal size={16} />, cls: "bg-slate-300/15 text-slate-200 border-slate-300/40" };
  if (rank === 3) return { icon: <Medal size={16} />, cls: "bg-amber-600/15 text-amber-500 border-amber-600/40" };
  return { icon: <span className="text-sm font-bold">{rank}</span>, cls: "bg-velo-card text-gray-400 border-velo-border" };
}

export default function LeaderboardPage() {
  const { address } = useAppKitAccount();
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const me = useMemo(() => (address ? address.toLowerCase() : null), [address]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/xp/leaderboard?limit=100");
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load leaderboard");
      setRows(data.leaderboard || []);
    } catch (e: any) {
      setError(e.message || "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="w-full flex flex-col gap-5 mt-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-velo-cyan/15 border border-velo-cyan/30 flex items-center justify-center text-velo-cyan">
            <Trophy size={22} />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">Velo XP Leaderboard</h1>
            <p className="text-xs text-gray-500">Earn XP on every transaction. XP drives your airdrop allocation.</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="w-9 h-9 rounded-full bg-velo-card border border-velo-border text-gray-400 hover:text-velo-cyan hover:border-velo-cyan/50 transition-all flex items-center justify-center disabled:opacity-40"
          aria-label="Refresh"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* States */}
      {loading && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500 gap-3">
          <Loader2 size={26} className="animate-spin text-velo-cyan" />
          <span className="text-sm">Loading rankings…</span>
        </div>
      )}

      {error && !loading && (
        <div className="text-center py-16 text-red-400 text-sm bg-red-500/5 border border-red-500/20 rounded-2xl">
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="text-center py-20 text-gray-500 bg-black/20 border border-velo-border rounded-2xl">
          <Trophy size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No XP earned yet. Be the first — connect and make a swap.</p>
        </div>
      )}

      {/* List */}
      {rows.length > 0 && (
        <div className="flex flex-col gap-2">
          {rows.map((row) => {
            const badge = rankBadge(row.rank);
            const isMe = me && row.wallet.toLowerCase() === me;
            return (
              <motion.div
                key={row.wallet}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(row.rank, 12) * 0.02 }}
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 border transition-colors ${
                  isMe
                    ? "bg-velo-cyan/10 border-velo-cyan/40"
                    : "bg-velo-card border-velo-border hover:border-white/15"
                }`}
              >
                <div className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${badge.cls}`}>
                  {badge.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">
                    {row.displayName || shortWallet(row.wallet)}
                    {isMe && <span className="ml-2 text-[10px] font-bold text-velo-cyan uppercase tracking-wider">You</span>}
                  </div>
                  <div className="text-[11px] text-gray-500">{row.swaps} swap{row.swaps === 1 ? "" : "s"}</div>
                </div>
                <div className="flex items-center gap-1.5 text-velo-cyan font-bold shrink-0">
                  <Zap size={14} className="fill-velo-cyan/20" />
                  {row.xp.toLocaleString()}
                  <span className="text-[10px] text-gray-500 font-medium ml-0.5">XP</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
