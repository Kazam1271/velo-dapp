"use client";

import { useState, useRef } from "react";
import dynamic from "next/dynamic";
import { 
  User, 
  Edit2, 
  Copy, 
  Check, 
  X,
  ArrowRightLeft, 
  Plus, 
  Send, 
  ChevronRight,
  TrendingUp,
  Wallet
} from "lucide-react";
import Image from "next/image";

const Header = dynamic(() => import("@/components/Header"), { ssr: false });
const BottomNav = dynamic(() => import("@/components/BottomNav"), { ssr: false });

const mockTokens = [
  { name: 'Hedera', ticker: 'HBAR', balance: '5,000.25', value: '$2,250.11', icon: 'https://cryptologos.cc/logos/hedera-hashgraph-hbar-logo.png' },
  { name: 'Saucer', ticker: 'SAUCE', balance: '1,250.5', value: '$1,875.75', icon: 'https://raw.githubusercontent.com/saucerswaplabs/assets/master/tokens/sauce.png' },
  { name: 'VeloToken', ticker: 'VELO', balance: '8,500', value: '$12,750.00', icon: '/logov.png' },
  { name: 'USD Coin', ticker: 'USDC', balance: '3,200', value: '$3,200.00', icon: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png' }
];

const mockActivity = [
  { action: 'Swapped HBAR for USDC', path: 'HBAR → USDC', value: '$1500.00', time: '2 hours ago', type: 'swap', status: 'success' },
  { action: 'Pool Contribution', path: 'VELO → Pool', value: '$2500.00', time: '5 hours ago', type: 'pool', status: 'success' },
  { action: 'Token Transfer', path: 'HBAR → Friend Wallet', value: '$500.50', time: '1 day ago', type: 'transfer', status: 'success' },
  { action: 'Swapped SAUCE for VELO', path: 'SAUCE → VELO', value: '$3200.00', time: '2 days ago', type: 'swap', status: 'success' },
  { action: 'Pool Contribution', path: 'USDC → Pool', value: '$1000.00', time: '3 days ago', type: 'pool', status: 'pending' }
];

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<'portfolio' | 'activity'>('portfolio');
  const [copied, setCopied] = useState(false);
  
  // New States for Interactivity
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [username, setUsername] = useState('DigitalPioneer#8761');
  const [isEditing, setIsEditing] = useState(false);
  const [tempUsername, setTempUsername] = useState(username);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAvatarUrl(url);
    }
  };

  const handleSaveUsername = () => {
    setUsername(tempUsername);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setTempUsername(username);
    setIsEditing(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText("0.0.145...b7");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-velo-bg text-white relative flex justify-center selection:bg-velo-cyan/30">
      <main className="w-full max-w-lg min-h-screen flex flex-col mx-auto px-4 box-border pb-32">
        <Header />

        <div className="mt-8 space-y-6">
          {/* Identity Card */}
          <section className="bg-velo-card border border-velo-border rounded-[32px] p-8 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-velo-cyan/5 blur-[60px] -z-10" />
            
            <div className="flex flex-col items-center text-center space-y-6">
              {/* Avatar Section */}
              <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                />
                <div className="w-28 h-28 rounded-full border-2 border-velo-cyan/30 flex items-center justify-center bg-black/40 backdrop-blur-sm group-hover:border-velo-cyan transition-all duration-300 shadow-[0_0_20px_rgba(6,182,212,0.1)] overflow-hidden">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <User size={48} className="text-velo-cyan/60 group-hover:text-velo-cyan transition-colors" />
                  )}
                </div>
                <div className="mt-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest group-hover:text-velo-cyan transition-colors">
                  Upload Picture
                </div>
              </div>

              {/* Name Section */}
              <div className="flex items-center gap-3">
                {isEditing ? (
                  <div className="flex items-center gap-2 animate-in zoom-in-95 duration-200">
                    <input 
                      type="text"
                      value={tempUsername}
                      onChange={(e) => setTempUsername(e.target.value)}
                      className="bg-black/40 border border-velo-cyan/50 rounded-xl px-4 py-2 text-xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-velo-cyan/30 w-64"
                      autoFocus
                    />
                    <button 
                      onClick={handleSaveUsername}
                      className="p-2 rounded-xl bg-velo-green/20 text-velo-green hover:bg-velo-green/30 transition-all"
                    >
                      <Check size={18} />
                    </button>
                    <button 
                      onClick={handleCancelEdit}
                      className="p-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <>
                    <h1 className="text-3xl font-black tracking-tight">
                      {username.includes('#') ? (
                        <>
                          {username.split('#')[0]}<span className="text-velo-cyan">#{username.split('#')[1]}</span>
                        </>
                      ) : username}
                    </h1>
                    <button 
                      onClick={() => setIsEditing(true)}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                    >
                      <Edit2 size={16} />
                    </button>
                  </>
                )}
              </div>

              {/* ID & Address Section */}
              <div className="space-y-4 w-full pt-4 border-t border-white/5">
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-1">Unique ID</p>
                  <p className="text-sm font-mono text-white/90">VeloID: <span className="text-velo-cyan">V47X-98PQ</span></p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-1">Wallet Address</p>
                  <button 
                    onClick={handleCopy}
                    className="flex items-center gap-2 mx-auto px-4 py-2 rounded-xl bg-black/20 border border-white/5 hover:border-velo-cyan/30 transition-all group"
                  >
                    <span className="text-sm font-mono text-gray-400 group-hover:text-white transition-colors">0.0.145 ... b7</span>
                    {copied ? <Check size={14} className="text-velo-green" /> : <Copy size={14} className="text-gray-500 group-hover:text-velo-cyan transition-colors" />}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Tabbed Content Area */}
          <section className="bg-velo-card border border-velo-border rounded-[32px] overflow-hidden shadow-2xl">
            <div className="flex border-b border-velo-border">
              <button 
                onClick={() => setActiveTab('portfolio')}
                className={`flex-1 py-4 text-sm font-black uppercase tracking-widest transition-all relative ${
                  activeTab === 'portfolio' ? "text-white" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Portfolio
                {activeTab === 'portfolio' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-velo-cyan shadow-[0_0_10px_rgba(6,182,212,0.5)]" />
                )}
              </button>
              <button 
                onClick={() => setActiveTab('activity')}
                className={`flex-1 py-4 text-sm font-black uppercase tracking-widest transition-all relative ${
                  activeTab === 'activity' ? "text-white" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Activity
                {activeTab === 'activity' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-velo-cyan shadow-[0_0_10px_rgba(6,182,212,0.5)]" />
                )}
              </button>
            </div>

            <div className="p-6">
              {activeTab === 'portfolio' ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Portfolio Value Summary */}
                  <div className="bg-gradient-to-br from-velo-cyan/10 to-transparent border border-velo-cyan/20 rounded-2xl p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <TrendingUp size={64} />
                    </div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Total Portfolio Value</p>
                    <h2 className="text-3xl font-black text-white">$20,075.86</h2>
                  </div>

                  {/* Token List */}
                  <div className="space-y-3">
                    {mockTokens.map((token) => (
                      <div 
                        key={token.ticker}
                        className="flex items-center justify-between p-4 rounded-2xl bg-black/20 border border-white/5 hover:border-velo-cyan/20 transition-all group cursor-pointer"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center overflow-hidden border border-white/10 p-1">
                            <img src={token.icon} alt={token.name} className="w-full h-full object-contain" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white group-hover:text-velo-cyan transition-colors">{token.name}</p>
                            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-widest">{token.ticker}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-white">{token.balance} <span className="text-[10px] text-gray-500">{token.ticker}</span></p>
                          <p className="text-[11px] font-bold text-velo-cyan/60">{token.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Activity List */}
                  {mockActivity.map((item, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between p-4 rounded-2xl bg-black/20 border border-white/5 hover:border-white/10 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${
                          item.type === 'swap' ? "bg-velo-cyan/10 border-velo-cyan/20 text-velo-cyan" :
                          item.type === 'pool' ? "bg-velo-green/10 border-velo-green/20 text-velo-green" :
                          "bg-blue-500/10 border-blue-500/20 text-blue-400"
                        }`}>
                          {item.type === 'swap' ? <ArrowRightLeft size={18} /> :
                           item.type === 'pool' ? <Plus size={18} /> :
                           <Send size={18} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white group-hover:text-velo-cyan transition-colors">{item.action}</p>
                          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-widest">{item.path}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-white">{item.value}</p>
                        <div className="flex items-center justify-end gap-1.5">
                          {item.status === 'success' ? (
                            <Check size={12} className="text-velo-green" />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                          )}
                          <span className={`text-[10px] font-bold ${item.status === 'success' ? "text-velo-cyan/60" : "text-yellow-500/60"}`}>
                            {item.time}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button className="w-full py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] hover:text-white transition-all border border-dashed border-white/10 rounded-2xl mt-4">
                    Load More Activity
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>

        <BottomNav />
      </main>
    </div>
  );
}
