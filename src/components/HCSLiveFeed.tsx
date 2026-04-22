"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useHCSData } from "@/contexts/HCSDataProvider";
import { CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";

export default function HCSLiveFeed() {
  const { feed } = useHCSData();
  const [now, setNow] = useState(Date.now());

  // Keep 'now' ticking for relative time updates
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const formatRel = (ts: number) => {
    const diff = Math.floor((now - ts) / 1000);
    if (diff < 1) return "now";
    return `${diff}s`;
  };

  return (
    <div className="w-full max-w-md mx-auto mt-8 mb-24">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-velo-green text-sm font-bold uppercase tracking-widest">HCS Live Feed</h2>
        <span className="w-2 h-2 rounded-full bg-velo-green glow-green"></span>
      </div>

      <div className="bg-[#0b0e14] border border-velo-border rounded-xl overflow-hidden shadow-2xl font-mono text-xs">
        {/* Terminal Header */}
        <div className="bg-[#131823] px-4 py-2 flex items-center justify-between border-b border-velo-border">
          <div className="flex gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]"></div>
          </div>
          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-velo-green animate-pulse"></span>
            HCS Node 0.0.3 (Latency: 42ms)
          </div>
          <div className="w-8"></div>
        </div>

        {/* Terminal Body */}
        <div className="p-4 h-64 overflow-hidden relative">
          <AnimatePresence initial={false}>
            {feed.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col gap-1 py-3 border-b border-white/5 last:border-0"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600 font-bold">{formatRel(item.timestamp)}</span>
                    <span className="text-velo-cyan">hash:{item.txHash.slice(0, 8)}...</span>
                  </div>
                  <div className="text-gray-600 uppercase tracking-tighter">
                    msg_seq: {Math.floor(item.timestamp / 1000 % 100000)}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-gray-400">
                    <span className="text-white/40">{item.account}</span>{" "}
                    <span className={item.action === "swapped" ? "text-blue-400" : "text-purple-400"}>
                      {item.action}
                    </span>{" "}
                    {item.amount1 && (
                      <span className="text-velo-green font-bold">
                        {item.amount1} {item.token1}
                      </span>
                    )}{" "}
                    {item.preps}{" "}
                    {item.amount2 && <span className="text-white font-bold">{item.amount2}</span>} {item.token2}
                  </div>
                  <div className="text-velo-green">
                    <CheckCircle2 size={14} />
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {/* Gradient to fade out bottom items */}
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#0b0e14] to-transparent pointer-events-none"></div>
        </div>
      </div>
    </div>
  );
}
