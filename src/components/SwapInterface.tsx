import { ArrowUpDown, ChevronDown, Info } from "lucide-react";

export default function SwapInterface() {
  return (
    <div className="bg-velo-card border border-velo-border rounded-3xl p-4 sm:p-6 shadow-2xl w-full max-w-md mx-auto mt-8 relative">
      <div className="flex justify-between text-sm text-gray-400 mb-6 px-2">
        <button className="hover:text-white transition-colors">25%</button>
        <button className="hover:text-white transition-colors">50%</button>
        <button className="hover:text-white transition-colors">75%</button>
        <button className="hover:text-white transition-colors">Max</button>
      </div>

      <div className="relative">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 z-10">
          <button className="bg-[#1a2130] border border-velo-border rounded-full p-2 hover:bg-[#232d42] transition-colors">
            <ArrowUpDown size={16} className="text-velo-cyan" />
          </button>
        </div>

        <div className="bg-[#0b0e14] rounded-2xl p-4 border border-velo-border mb-6">
          <div className="text-sm text-gray-400 mb-2">You Receive</div>
          <div className="flex items-center justify-between gap-4">
            <input 
              type="text" 
              placeholder="0.00" 
              className="bg-transparent text-4xl w-full outline-none text-white font-medium placeholder-gray-600"
              readOnly
            />
            <button className="flex items-center gap-2 bg-[#1a2130] hover:bg-[#232d42] px-4 py-2 rounded-xl text-white font-medium transition-colors whitespace-nowrap">
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold text-white">$</div>
              USDC
              <ChevronDown size={16} className="text-gray-400 ml-1" />
            </button>
          </div>
          <div className="text-sm text-gray-400 mt-3">Balance: 456.78</div>
        </div>
      </div>

      <button className="w-full bg-velo-cyan hover:bg-cyan-400 text-[#0b0e14] text-lg font-bold py-4 rounded-xl transition-all glow-cyan mb-6">
        INSTANT SWAP
      </button>

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
