"use client";

import { useHashConnect } from "@/contexts/HashConnectProvider";
import { HashConnectConnectionState } from "hashconnect";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

const customWallets = [
  {
    id: 'hashpack',
    name: 'HashPack',
    homepage: 'https://www.hashpack.app/',
    image_url: 'https://cdn.hashpack.app/branding/hashpack-logo.png',
    mobile_link: 'https://wallet.hashpack.app',
    desktop_link: 'https://wallet.hashpack.app',
    webapp_link: 'https://wallet.hashpack.app',
    recommended: true
  },
  {
    id: 'blade',
    name: 'Blade Wallet',
    homepage: 'https://bladewallet.io/',
    image_url: 'https://www.bladewallet.io/wp-content/uploads/2022/04/Blade-Logo-White.png', 
    mobile_link: 'https://bladewallet.io',
    desktop_link: 'https://bladewallet.io',
    webapp_link: 'https://bladewallet.io'
  },
  {
    id: 'kabila',
    name: 'Kabila Wallet',
    homepage: 'https://kabila.app/',
    image_url: 'https://app.kabila.app/favicon.ico', 
    mobile_link: 'https://app.kabila.app',
    desktop_link: 'https://app.kabila.app',
    webapp_link: 'https://app.kabila.app'
  }
];

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
    
    // Check for in-app browser
    if (typeof window !== 'undefined' && (window as any).hashpack) {
      (hashconnect as any).connectToLocalWallet();
      setIsModalOpen(false);
      return;
    }

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
      // For Desktop or fallback, open the universal modal
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
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 blur-[80px] -z-10" />
            
            <div className="flex justify-between items-center mb-6 px-1">
              <h2 className="text-white font-bold text-xl tracking-tight">Connect Wallet</h2>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="w-9 h-9 flex items-center justify-center rounded-full bg-[#1E1E1E] text-slate-400 hover:text-white transition-all text-2xl"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3">
              {customWallets.map((wallet) => (
                <button 
                  key={wallet.id}
                  onClick={() => handleWalletClick(wallet.id)} 
                  className="w-full flex items-center justify-between bg-[#1A1C1C] hover:bg-[#272A2A] border border-[#272A2A] p-4 rounded-2xl transition-all group active:scale-[0.98]"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-black flex items-center justify-center p-1 border border-white/10 shadow-inner overflow-hidden">
                      <img 
                        src={wallet.image_url} 
                        alt={wallet.name} 
                        className="w-full h-full object-contain"
                        onError={(e) => { 
                          // Simple fallback logic if official URL fails
                          if (wallet.id === 'hashpack') e.currentTarget.src = "https://www.hashpack.app/img/logo.svg";
                          if (wallet.id === 'blade') e.currentTarget.src = "https://raw.githubusercontent.com/saucerswaplabs/assets/master/tokens/blade.png";
                        }}
                      />
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <span className="text-white font-bold text-md group-hover:text-cyan-400 transition-colors">{wallet.name}</span>
                      <span className="text-[10px] text-slate-500 font-medium">Extension or Mobile</span>
                    </div>
                  </div>
                  {wallet.recommended && (
                    <span className="text-[10px] font-bold text-[#10B981] bg-[#10B981]/10 px-2 py-1 rounded-lg border border-[#10B981]/20">RECOMMENDED</span>
                  )}
                </button>
              ))}
              
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
