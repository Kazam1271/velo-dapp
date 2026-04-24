"use client";

import { useHashConnect } from "@/contexts/HashConnectProvider";
import { HashConnectConnectionState } from "hashconnect";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

export const ConnectWalletButton = () => {
  const { state, pairingData, isConnected, hashconnect, disconnect } = useHashConnect();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const accountId = pairingData?.accountIds[0];

  const handleWalletClick = (walletId?: string) => {
    if (!hashconnect) return;
    
    const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const pairingString = (hashconnect as any).pairingString;
    
    if (isMobile && pairingString && walletId) {
      if (walletId === 'hashpack') {
        window.location.href = `hashpack://pairing?string=${pairingString}`;
      } else if (walletId === 'blade') {
        window.location.href = `blade://pairing?string=${pairingString}`;
      } else if (walletId === 'kabila') {
        window.location.href = `kabila://pairing?string=${pairingString}`;
      }
    } else {
      // For Desktop or generic mobile, use the universal modal
      // This is the most reliable way to trigger extensions on desktop
      try {
        hashconnect.openPairingModal();
      } catch (err) {
        console.error("Failed to open pairing modal", err);
      }
    }
    
    setIsModalOpen(false);
  };

  if (isConnected && accountId) {
    return (
      <button 
        onClick={disconnect} 
        className="bg-[#141414] text-cyan-400 border border-slate-800 px-4 py-2 rounded-2xl hover:bg-[#1E1E1E] transition-all font-semibold shadow-lg active:scale-95 flex items-center gap-2 group"
      >
        <div className="w-2 h-2 rounded-full bg-cyan-400 group-hover:animate-pulse" />
        {accountId} (Disconnect)
      </button>
    );
  }

  const ModalContent = (
    <AnimatePresence>
      {isModalOpen && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 isolate">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsModalOpen(false)}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-[#141414] border border-[#272A2A] rounded-[32px] w-full max-w-[380px] p-6 shadow-2xl relative z-[1000000] overflow-hidden"
          >
            {/* Ambient Background Glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 blur-[80px] -z-10" />
            
            {/* Header */}
            <div className="flex justify-between items-center mb-6 px-1">
              <h2 className="text-white font-bold text-xl tracking-tight">Connect Wallet</h2>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="w-9 h-9 flex items-center justify-center rounded-full bg-[#1E1E1E] text-slate-400 hover:text-white transition-all text-2xl"
              >
                &times;
              </button>
            </div>

            {/* Wallet List */}
            <div className="space-y-3">
              {/* HashPack */}
              <button 
                onClick={() => handleWalletClick('hashpack')} 
                className="w-full flex items-center justify-between bg-[#1A1C1C] hover:bg-[#272A2A] border border-[#272A2A] p-4 rounded-2xl transition-all group active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-black flex items-center justify-center p-1 border border-white/10 shadow-inner overflow-hidden">
                    <img 
                      src="https://www.hashpack.app/img/logo.svg" 
                      alt="HashPack" 
                      className="w-full h-full object-contain"
                      onError={(e) => { e.currentTarget.src = "https://cdn.hashpack.app/branding/hashpack-logo.png"; }}
                    />
                  </div>
                  <div className="flex flex-col items-start text-left">
                    <span className="text-white font-bold text-md group-hover:text-cyan-400 transition-colors">HashPack</span>
                    <span className="text-[10px] text-slate-500 font-medium">Extension or Mobile</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-[#10B981] bg-[#10B981]/10 px-2 py-1 rounded-lg border border-[#10B981]/20">RECOMMENDED</span>
              </button>

              {/* Blade Wallet */}
              <button 
                onClick={() => handleWalletClick('blade')} 
                className="w-full flex items-center justify-between bg-[#1A1C1C] hover:bg-[#272A2A] border border-[#272A2A] p-4 rounded-2xl transition-all group active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-black flex items-center justify-center p-2 border border-white/10 shadow-inner overflow-hidden">
                    <img 
                      src="https://raw.githubusercontent.com/saucerswaplabs/assets/master/tokens/blade.png" 
                      alt="Blade" 
                      className="w-full h-full object-contain"
                      onError={(e) => { e.currentTarget.src = "https://www.bladewallet.io/wp-content/uploads/2022/04/Blade-Logo-White.png"; }}
                    />
                  </div>
                  <span className="text-white font-bold text-md group-hover:text-cyan-400 transition-colors">Blade Wallet</span>
                </div>
              </button>

              {/* Kabila Wallet */}
              <button 
                onClick={() => handleWalletClick('kabila')} 
                className="w-full flex items-center justify-between bg-[#1A1C1C] hover:bg-[#272A2A] border border-[#272A2A] p-4 rounded-2xl transition-all group active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-black flex items-center justify-center p-1 border border-white/10 overflow-hidden shadow-inner">
                    <img 
                      src="https://app.kabila.app/favicon.ico" 
                      alt="Kabila" 
                      className="w-full h-full object-contain"
                      onError={(e) => { e.currentTarget.src = "https://pbs.twimg.com/profile_images/1587395015842856960/T-8J6HkO_400x400.jpg"; }}
                    />
                  </div>
                  <span className="text-white font-bold text-md group-hover:text-cyan-400 transition-colors">Kabila Wallet</span>
                </div>
              </button>
              
              {/* Other Wallets */}
              <button 
                onClick={() => handleWalletClick()} 
                className="w-full flex items-center justify-between bg-[#1A1C1C]/50 hover:bg-[#272A2A] border border-[#272A2A] p-4 rounded-2xl transition-all group mt-6 active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-[#3B82F6]/10 flex items-center justify-center text-[#3B82F6] border border-[#3B82F6]/20">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14.899A7 7 0 1 1 20 14.9V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4.101z"></path></svg>
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-white font-bold text-md group-hover:text-cyan-400 transition-colors">Other Wallets</span>
                    <span className="text-[10px] text-slate-500 font-medium">WalletConnect QR</span>
                  </div>
                </div>
                <div className="w-6 h-6 rounded-full bg-[#1E1E1E] flex items-center justify-center">
                   <svg className="text-slate-500 group-hover:text-white" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
              </button>
            </div>

            {/* Help / Footer */}
            <div className="mt-8 text-center border-t border-[#272A2A] pt-4">
              <button className="text-[11px] text-slate-500 hover:text-white transition-colors uppercase tracking-[0.2em] font-black">
                What is a wallet?
              </button>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button 
        onClick={() => setIsModalOpen(true)} 
        className="bg-cyan-500 text-black font-extrabold px-7 py-3 rounded-2xl hover:bg-cyan-400 transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] active:scale-95 text-sm tracking-tight"
      >
        Connect Wallet
      </button>
      
      {mounted && createPortal(ModalContent, document.body)}
    </>
  );
};
