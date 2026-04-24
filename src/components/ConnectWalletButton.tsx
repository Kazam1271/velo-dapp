"use client";

import { useHashConnect } from "@/contexts/HashConnectProvider";
import { HashConnectConnectionState } from "hashconnect";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const ConnectWalletButton = () => {
  const { state, pairingData, hashconnect, disconnect } = useHashConnect();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isConnected = state === HashConnectConnectionState.Connected;
  const accountId = pairingData?.accountIds[0];

  const handleConnect = () => {
    if (hashconnect) {
      hashconnect.openPairingModal();
    }
    setIsModalOpen(false);
  };

  if (isConnected && accountId) {
    return (
      <button 
        onClick={disconnect} 
        className="bg-[#141414] text-cyan-400 border border-[#272A2A] px-4 py-2 rounded-2xl hover:bg-[#1E1E1E] transition-all font-semibold shadow-lg flex items-center gap-2 group"
      >
        <div className="w-2 h-2 rounded-full bg-cyan-400 group-hover:animate-pulse" />
        {accountId}
      </button>
    );
  }

  return (
    <>
      <button 
        onClick={() => setIsModalOpen(true)} 
        className="bg-cyan-500 text-black font-bold px-6 py-2.5 rounded-2xl hover:bg-cyan-400 transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)] active:scale-95"
      >
        Connect Wallet
      </button>
      
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-[#141414] border border-[#272A2A] rounded-[32px] w-full max-w-[360px] p-4 shadow-2xl relative z-10 overflow-hidden"
            >
              
              {/* Header */}
              <div className="flex justify-between items-center mb-4 px-2">
                <div className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1E1E1E] text-slate-400">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                </div>
                <h2 className="text-white font-bold text-lg">Connect Wallet</h2>
                <button 
                  onClick={() => setIsModalOpen(false)} 
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1E1E1E] text-slate-400 hover:text-white hover:bg-[#2A2A2A] transition-all"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>

              {/* Wallet List */}
              <div className="space-y-1">
                {/* HashPack */}
                <button onClick={handleConnect} className="w-full flex items-center justify-between bg-transparent hover:bg-[#1E1E1E] p-3 rounded-2xl transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#1a1a1a] flex items-center justify-center overflow-hidden border border-[#272A2A]">
                      <img src="https://www.hashpack.app/img/logo.svg" alt="HashPack" className="w-6 h-6 object-contain" />
                    </div>
                    <span className="text-white font-semibold text-md group-hover:text-cyan-400 transition-colors">HashPack</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-[#10B981] bg-[#10B981]/10 px-2 py-1 rounded-lg">INSTALLED</span>
                    <svg className="text-[#3A3A3A] group-hover:text-slate-400 transition-colors" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </div>
                </button>

                {/* Blade Wallet */}
                <button onClick={handleConnect} className="w-full flex items-center justify-between bg-transparent hover:bg-[#1E1E1E] p-3 rounded-2xl transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#1a1a1a] flex items-center justify-center overflow-hidden border border-[#272A2A]">
                      <img src="https://raw.githubusercontent.com/saucerswaplabs/assets/master/tokens/blade.png" alt="Blade" className="w-6 h-6 object-contain" />
                    </div>
                    <span className="text-white font-semibold text-md group-hover:text-cyan-400 transition-colors">Blade Wallet</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-[#10B981] bg-[#10B981]/10 px-2 py-1 rounded-lg">INSTALLED</span>
                    <svg className="text-[#3A3A3A] group-hover:text-slate-400 transition-colors" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </div>
                </button>

                {/* WalletConnect (Other/Mobile) */}
                <button onClick={handleConnect} className="w-full flex items-center justify-between bg-transparent hover:bg-[#1E1E1E] p-3 rounded-2xl transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#3B82F6]/10 flex items-center justify-center text-[#3B82F6] border border-[#3B82F6]/20">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14.899A7 7 0 1 1 20 14.9V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4.101z"></path></svg>
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="text-white font-semibold text-md group-hover:text-cyan-400 transition-colors">Other Wallets</span>
                      <span className="text-[10px] text-slate-500">WalletConnect</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">QR Code</span>
                    <svg className="text-[#3A3A3A] group-hover:text-slate-400 transition-colors" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </div>
                </button>
              </div>

              {/* Footer / Help */}
              <div className="mt-4 pt-4 border-t border-[#272A2A] text-center">
                <button className="text-[11px] font-bold text-slate-500 hover:text-white transition-colors uppercase tracking-widest">
                  What is a wallet?
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
