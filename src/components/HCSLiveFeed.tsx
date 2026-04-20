"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useHCSData } from "@/contexts/HCSDataProvider";
import { CheckCircle2 } from "lucide-react";

export default function HCSLiveFeed() {
  const { feed } = useHCSData();

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
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <div className="text-gray-500">hedera-consensus-service</div>
          <div className="w-12"></div> {/* Spacer for centering text */}
        </div>

        {/* Terminal Body */}
        <div className="p-4 h-64 overflow-hidden relative">
          <AnimatePresence>
            {feed.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4 }}
                className="flex items-center justify-between py-3 border-b border-white/5 last:border-0"
              >
                <div className="flex items-start gap-4 flex-1">
                  <div className="text-gray-600 min-w-10">
                    <span className="block">{item.timeAgo}</span>
                  </div>
                  <div className="text-gray-400">
                    Someone{" "}
                    <span className="text-blue-400">{item.action}</span>{" "}
                    {item.amount1 && <span className="text-velo-green font-bold">{item.amount1} {item.token1}</span>}{" "}
                    {item.preps}{" "}
                    {item.amount2 && <span className="text-white font-bold">{item.amount2}</span>} {item.token2}
                  </div>
                </div>
                <div className="text-velo-green ml-4">
                  <CheckCircle2 size={16} />
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
