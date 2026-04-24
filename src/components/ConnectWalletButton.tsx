"use client";

import { useHashConnect } from "@/contexts/HashConnectProvider";
import { HashConnectConnectionState } from "hashconnect";
import { useState } from "react";
import { Zap, Wallet, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export const ConnectWalletButton = () => {
  const { state, pairingData, connect, disconnect } = useHashConnect();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isConnected = state === HashConnectConnectionState.Connected;
  const accountId = pairingData?.accountIds[0];

  const handleExtensionConnect = () => {
    connect(); // Uses the 'magic command' or pairing modal logic defined in provider
    setIsModalOpen(false);
  };

  const handleMobileConnect = () => {
    // In our provider, we can expose openModal or just use connect
    // For this specific request, we'll assume the user wants an explicit choice
    // But since our 'connect' now uses openPairingModal() (which is universal),
    // both can technically call the same thing or we can trigger different flows if needed.
    connect(); 
    setIsModalOpen(false);
  };

  if (isConnected && accountId) {
    return (
      <button 
        onClick={disconnect} 
        className="bg-slate-800 text-cyan-400 border border-cyan-500/30 px-4 py-2 rounded-xl hover:bg-slate-700 transition-all font-semibold flex items-center gap-2 group"
      >
        <Wallet size={16} className="group-hover:scale-110 transition-transform" />
        {accountId}
      </button>
    );
  }

  return (
    <>
      <button 
        onClick={() => setIsModalOpen(true)} 
        className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold px-6 py-2.5 rounded-xl hover:opacity-90 transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)] flex items-center gap-2 active:scale-95"
      >
        <Zap size={18} fill="currentColor" />
        Connect Wallet
      </button>
      
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-[#131823] border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative z-10 overflow-hidden"
            >
              {/* Background Glow */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 blur-[80px] -z-10" />
              
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Zap size={20} className="text-cyan-400" fill="currentColor" />
                  Connect to Velo
                </h2>
                <button 
                  onClick={() => setIsModalOpen(false)} 
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Hedera Native Options */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">Web3 Wallets</p>
                  <button 
                    onClick={handleExtensionConnect} 
                    className="w-full flex items-center justify-between bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 p-4 rounded-xl transition-all mb-3 group"
                  >
                    <div className="flex flex-col items-start">
                      <span className="text-white font-medium group-hover:text-cyan-400 transition-colors">Browser Extension</span>
                      <span className="text-[10px] text-slate-500">HashPack, Blade, or Kabila</span>
                    </div>
                    <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-md">Native</span>
                  </button>
                  <button 
                    onClick={handleMobileConnect} 
                    className="w-full flex items-center justify-between bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 p-4 rounded-xl transition-all group"
                  >
                    <div className="flex flex-col items-start">
                      <span className="text-white font-medium group-hover:text-cyan-400 transition-colors">Mobile Wallet</span>
                      <span className="text-[10px] text-slate-500">Pair via WalletConnect QR</span>
                    </div>
                    <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-md">QR Code</span>
                  </button>
                </div>

                {/* Web2 Social Options */}
                <div className="pt-6 border-t border-slate-800">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">Social Login</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button disabled className="flex items-center justify-center gap-2 bg-[#1877F2]/5 border border-[#1877F2]/20 text-[#1877F2]/50 p-3 rounded-xl cursor-not-allowed grayscale">
                      <span className="font-medium text-sm">Facebook</span>
                    </button>
                    <button disabled className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-white/30 p-3 rounded-xl cursor-not-allowed">
                      <span className="font-medium text-sm">Email</span>
                    </button>
                  </div>
                  <p className="text-center text-[10px] text-slate-600 mt-4 leading-relaxed">
                    Social logins requiring Account Abstraction (ERC-4337 equivalent on Hedera) coming in V2.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
