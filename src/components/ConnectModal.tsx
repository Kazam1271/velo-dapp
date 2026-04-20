"use client";

import React from "react";
import { X, Mail, Globe } from "lucide-react";
import { useWeb3 } from "@/contexts/Web3Provider";

export default function ConnectModal() {
  const { isModalOpen, setModalOpen, connectMetaMask, connectHashPack, connectGoogle } = useWeb3();

  if (!isModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      {/* Modal Container */}
      <div className="bg-[#0b0e14] border border-velo-cyan/30 rounded-3xl w-full max-w-sm overflow-hidden shadow-[0_0_40px_rgba(6,182,212,0.15)] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-velo-border/50">
          <h2 className="text-white font-semibold flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-velo-cyan glow-cyan"></div>
            Connect Wallet
          </h2>
          <button 
            onClick={() => setModalOpen(false)}
            className="p-1 rounded-full bg-velo-card text-gray-400 hover:text-white transition-colors border border-velo-border/50"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col gap-3">
          
          {/* Primary Wallets */}
          <button 
            onClick={connectHashPack}
            className="flex items-center justify-between w-full bg-[#1a2130] hover:bg-[#232d42] border border-velo-border/50 rounded-2xl p-4 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-inner">
                <span className="font-bold text-black text-xs">HP</span>
              </div>
              <div className="text-left">
                <div className="text-white font-medium">HashPack</div>
                <div className="text-xs text-gray-500">Hedera Native App</div>
              </div>
            </div>
            <div className="px-2 py-1 rounded bg-velo-card text-[10px] text-gray-400 border border-velo-border/50 group-hover:border-velo-cyan/50 group-hover:text-velo-cyan transition-colors">
              Connect
            </div>
          </button>

          <button 
            onClick={connectMetaMask}
            className="flex items-center justify-between w-full bg-[#1a2130] hover:bg-[#232d42] border border-velo-border/50 rounded-2xl p-4 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center p-1 shadow-inner">
                {/* Simulated MetaMask Fox Colors */}
                <div className="w-full h-full rounded-lg bg-orange-500"></div>
              </div>
              <div className="text-left">
                <div className="text-white font-medium">MetaMask</div>
                <div className="text-xs text-gray-500">EVM Compatible</div>
              </div>
            </div>
            <div className="px-2 py-1 rounded bg-velo-card text-[10px] text-gray-400 border border-velo-border/50 group-hover:border-velo-cyan/50 group-hover:text-velo-cyan transition-colors">
              Connect
            </div>
          </button>

          {/* Divider */}
          <div className="flex items-center gap-2 my-2">
            <div className="h-px bg-velo-border/50 flex-1"></div>
            <span className="text-xs text-gray-500 font-medium">OR</span>
            <div className="h-px bg-velo-border/50 flex-1"></div>
          </div>

          {/* Social Logins */}
          <div className="flex flex-col gap-2">
            <button 
              onClick={connectGoogle}
              className="flex items-center justify-center gap-2 w-full bg-[#1a2130] hover:bg-[#232d42] border border-velo-border/50 rounded-xl p-3 transition-all text-sm text-gray-300 font-medium"
            >
              <Globe size={16} className="text-blue-400" />
              Continue with Google
            </button>
            <button 
              onClick={() => { (window as any).veloToast?.("Email login is disabled for pilot.", "error"); }}
              className="flex items-center justify-center gap-2 w-full bg-[#1a2130] hover:bg-[#232d42] border border-velo-border/50 rounded-xl p-3 transition-all text-sm text-gray-300 font-medium"
            >
              <Mail size={16} className="text-gray-400" />
              Continue with Email
            </button>
          </div>

        </div>
        
        {/* Footer */}
        <div className="bg-[#1a2130]/50 p-4 text-center text-[10px] text-gray-500 border-t border-velo-border/50">
          By connecting, you agree to Velo's Terms of Service.
        </div>

      </div>
    </div>
  );
}
