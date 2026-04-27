import { ArrowLeftRight, Droplets, Link, Send, User } from "lucide-react";
import { useState } from "react";

const navItems = [
  { name: 'Swap', icon: ArrowLeftRight, id: 'swap' },
  { name: 'Pools', icon: Droplets, id: 'pools' },
  { name: 'Bridge', icon: Link, id: 'bridge' },
  { name: 'Transfer', icon: Send, id: 'transfer' },
  { name: 'Profile', icon: User, id: 'profile' }
];

export default function BottomNav() {
  const [activeTab, setActiveTab] = useState('swap');

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-2">
      <div className="bg-[#0c1019]/90 border border-velo-border rounded-[24px] flex items-center justify-between p-1.5 shadow-2xl backdrop-blur-xl max-w-lg mx-auto overflow-hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          
          return (
            <button 
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl transition-all duration-300 relative group ${
                isActive 
                  ? "text-velo-green bg-velo-green/5" 
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {/* Active Indicator Bar */}
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-velo-green rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
              )}
              
              <Icon 
                size={22} 
                className={`transition-transform duration-300 ${isActive ? "scale-110" : "group-hover:scale-105"}`} 
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span className={`text-[10px] font-bold uppercase tracking-widest transition-all ${isActive ? "opacity-100" : "opacity-80 group-hover:opacity-100"}`}>
                {item.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
