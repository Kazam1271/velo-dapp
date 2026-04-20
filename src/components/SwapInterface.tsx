"use client";

import { ArrowUpDown, ChevronDown, Info } from "lucide-react";
import { useWeb3 } from "@/contexts/Web3Provider";

export default function SwapInterface() {
  const { isConnected, balance } = useWeb3();

  const displayBalance = isConnected ? balance : "0.00";

  const handleSwap = () => {
    if (!isConnected) {
      const veloToast = (window as any).veloToast;
      if (veloToast) veloToast('Please connect your wallet to perform a swap.', 'error');
      return;
    }
    // Swap logic would go here
  };

  return (
    <div className="bg-velo-card border border-velo-border rounded-3xl p-4 sm:p-6 shadow-2xl w-full max-w-md mx-auto mt-8 relative">
      
      {/* You Pay Card */}
      <div className="bg-[#0b0e14] rounded-2xl p-4 border border-velo-border mb-2 relative">
        <div className="text-sm text-gray-400 mb-2">You Pay</div>
        <div className="flex items-center justify-between gap-4">
          <input 
            type="text" 
            placeholder="0.00" 
            className="bg-transparent text-4xl w-full outline-none text-white font-medium placeholder-gray-600"
          />
          <button className="flex items-center gap-2 bg-[#1a2130] hover:bg-[#232d42] px-4 py-2 rounded-xl text-white font-medium transition-colors whitespace-nowrap border border-velo-border">
            <div className="w-6 h-6 rounded-full bg-black border border-gray-600 flex items-center justify-center text-xs font-bold text-white overflow-hidden">
              <span className="text-[10px]">ℏ</span>
            </div>
            HBAR
            <ChevronDown size={16} className="text-gray-400 ml-1" />
          </button>
        </div>
        
        <div className="flex justify-between items-center text-sm text-gray-400 mt-6 px-1">
          <div>Balance: <span className={isConnected ? "text-velo-cyan font-medium" : ""}>{displayBalance}</span></div>
          <div className="flex gap-4">
            <button className="hover:text-velo-cyan transition-colors">25%</button>
            <button className="hover:text-velo-cyan transition-colors">50%</button>
            <button className="hover:text-velo-cyan transition-colors">75%</button>
            <button className="hover:text-velo-cyan transition-colors">Max</button>
          </div>
        </div>
      </div>

      <div className="relative flex justify-center -my-3 z-10">
        <button className="bg-[#1a2130] border border-velo-border rounded-full p-2 hover:bg-[#232d42] transition-colors shadow-[0_0_10px_rgba(6,182,212,0.15)]">
          <ArrowUpDown size={16} className="text-velo-cyan" />
        </button>
      </div>

      {/* You Receive Card */}
      <div className="bg-[#0b0e14] rounded-2xl p-4 border border-velo-border mb-6">
        <div className="text-sm text-gray-400 mb-2">You Receive</div>
        <div className="flex items-center justify-between gap-4">
          <input 
            type="text" 
            placeholder="0.00" 
            className="bg-transparent text-4xl w-full outline-none text-white font-medium placeholder-gray-600"
            readOnly
          />
          <button className="flex items-center gap-2 bg-[#1a2130] hover:bg-[#232d42] px-4 py-2 rounded-xl text-white font-medium transition-colors whitespace-nowrap border border-velo-border">
            <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold text-white">$</div>
            USDC
            <ChevronDown size={16} className="text-gray-400 ml-1" />
          </button>
        </div>
        <div className="text-sm text-gray-400 mt-3">Balance: 456.78</div>
      </div>

      <button 
        onClick={handleSwap}
        className="w-full bg-velo-cyan hover:bg-cyan-400 text-[#0b0e14] text-lg font-bold py-4 rounded-xl transition-all glow-cyan mb-6"
      >
        INSTANT SWAP
      </button>

      <div className="text-center text-[10px] text-gray-500 mb-6 bg-velo-bg/50 py-3 px-4 rounded-xl border border-velo-border/50 flex items-center justify-center gap-3">
        <Info size={14} className="text-velo-cyan shrink-0" />
        <span className="leading-tight">Please ensure you are using an <span className="text-velo-cyan font-bold">ECDSA-type</span> account for full compatibility with Velo.</span>
      </div>

      <div className="flex justify-between items-center text-sm text-gray-400">
        <div className="flex items-center gap-1.5">
          <Info size={14} className="text-gray-500" />
          Fixed Fee: <span className="text-white">$0.001</span>
        </div>
        <div>
          Slippage: <span className="text-white">0.5%</span>
        </div>
      </div>
    </div>
  );
}
