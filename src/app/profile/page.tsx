"use client";

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from "react";
import nextDynamic from "next/dynamic";
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
  Wallet,
  Loader2,
  ExternalLink,
  History
} from "lucide-react";
import Image from "next/image";
import { useHashConnect } from "@/contexts/HashConnectProvider";
import { toast } from "sonner";

const Header = nextDynamic(() => import("@/components/Header"), { ssr: false });
const BottomNav = nextDynamic(() => import("@/components/BottomNav"), { ssr: false });

interface TokenBalance {
  name: string;
  ticker: string;
  balance: string;
  value: string;
  icon: string;
}

interface ActivityItem {
  action: string;
  path: string;
  value: string;
  time: string;
  type: 'swap' | 'pool' | 'transfer' | 'receive';
  status: 'success' | 'pending';
  hash: string;
}

export default function ProfilePage() {
  const { pairingData, isConnected } = useHashConnect();
  const accountId = pairingData?.accountIds?.[0] || null;
  
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'portfolio' | 'activity'>('portfolio');
  const [copiedId, setCopiedId] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  
  // Profile Interactivity States
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [username, setUsername] = useState('DigitalPioneer#8761');
  const [isEditing, setIsEditing] = useState(false);
  const [tempUsername, setTempUsername] = useState(username);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live Data States
  const [portfolio, setPortfolio] = useState<TokenBalance[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [isLoadingPortfolio, setIsLoadingPortfolio] = useState(false);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [totalValue, setTotalValue] = useState("0.00");

  // Safe client-side btoa for SSR
  const [veloId, setVeloId] = useState('Not Connected');
  
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && accountId && typeof window !== 'undefined') {
      try {
        const id = 'V-' + window.btoa(accountId).substring(0, 8).toUpperCase();
        setVeloId(id);
      } catch (e) {
        setVeloId('V-IDENTITY');
      }
    } else {
      setVeloId('Not Connected');
    }
  }, [accountId, mounted]);

  // ── Fetch Live Data ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mounted || !accountId) {
      setPortfolio([]);
      setActivity([]);
      setTotalValue("0.00");
      return;
    }

    const fetchData = async () => {
      setIsLoadingPortfolio(true);
      setIsLoadingActivity(true);

      try {
        // 1. Fetch Balances
        const balRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/balances?account.id=${accountId}`);
        if (balRes.ok) {
          const balData = await balRes.json();
          const accountBal = balData.balances[0];
          
          const hbarBal = (accountBal.balance / 100000000).toFixed(2);
          const tokens: TokenBalance[] = [
            { 
              name: 'Hedera', 
              ticker: 'HBAR', 
              balance: hbarBal, 
              value: `$${(parseFloat(hbarBal) * 0.08).toFixed(2)}`, // Mock price for now
              icon: 'https://cryptologos.cc/logos/hedera-hashgraph-hbar-logo.png' 
            }
          ];

          // Add other tokens if any
          if (accountBal.tokens) {
            accountBal.tokens.forEach((t: any) => {
              tokens.push({
                name: `Token ${t.token_id.split('.')[2]}`,
                ticker: t.token_id,
                balance: (t.balance / 10).toFixed(2), // Mock decimals
                value: "$0.00",
                icon: "/logov.png"
              });
            });
          }
          setPortfolio(tokens);
          setTotalValue(tokens.reduce((acc, curr) => acc + parseFloat(curr.value.replace('$', '')), 0).toFixed(2));
        }

        // 2. Fetch Activity
        const actRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/transactions?account.id=${accountId}&limit=10&order=desc`);
        if (actRes.ok) {
          const actData = await actRes.json();
          const items: ActivityItem[] = actData.transactions.map((tx: any) => {
            const isReceive = tx.transfers.some((tf: any) => tf.account === accountId && tf.amount > 0);
            return {
              action: isReceive ? 'Received Assets' : 'Sent Assets',
              path: tx.name === 'CRYPTO_TRANSFER' ? 'Transfer' : tx.name,
              value: `$${(Math.abs(tx.transfers.find((tf: any) => tf.account === accountId)?.amount || 0) / 100000000 * 0.08).toFixed(2)}`,
              time: new Date(tx.consensus_timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              type: isReceive ? 'receive' : 'transfer',
              status: 'success',
              hash: tx.transaction_id
            };
          });
          setActivity(items);
        }
      } catch (err) {
        console.error("Failed to fetch mirror node data:", err);
      } finally {
        setIsLoadingPortfolio(false);
        setIsLoadingActivity(false);
      }
    };

    fetchData();
  }, [accountId]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAvatarUrl(url);
      toast.success("Profile picture updated locally!");
    }
  };

  const handleCopy = (text: string, type: 'id' | 'addr') => {
    navigator.clipboard.writeText(text);
    if (type === 'id') {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } else {
      setCopiedAddr(true);
      setTimeout(() => setCopiedAddr(false), 2000);
    }
    toast.success("Copied to clipboard!");
  };

  if (!mounted) return <div className="min-h-screen bg-velo-bg" />;

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
                <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
                <div className="w-28 h-28 rounded-full border-2 border-velo-cyan/30 flex items-center justify-center bg-black/40 backdrop-blur-sm group-hover:border-velo-cyan transition-all duration-300 shadow-[0_0_20px_rgba(6,182,212,0.1)] overflow-hidden">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <User size={48} className="text-velo-cyan/60 group-hover:text-velo-cyan transition-colors" />
                  )}
                </div>
                <div className="mt-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest group-hover:text-velo-cyan transition-colors">
                  Change Photo
                </div>
              </div>

              {/* Name Section */}
              <div className="flex items-center gap-3">
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input 
                      type="text"
                      value={tempUsername}
                      onChange={(e) => setTempUsername(e.target.value)}
                      className="bg-black/40 border border-velo-cyan/50 rounded-xl px-4 py-2 text-xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-velo-cyan/30 w-64"
                      autoFocus
                    />
                    <button onClick={() => { setUsername(tempUsername); setIsEditing(false); toast.success("Username saved!"); }} className="p-2 rounded-xl bg-velo-green/20 text-velo-green hover:bg-velo-green/30 transition-all"><Check size={18} /></button>
                    <button onClick={() => { setTempUsername(username); setIsEditing(false); }} className="p-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"><X size={18} /></button>
                  </div>
                ) : (
                  <>
                    <h1 className="text-3xl font-black tracking-tight">{username}</h1>
                    <button onClick={() => setIsEditing(true)} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"><Edit2 size={16} /></button>
                  </>
                )}
              </div>

              {/* ID & Address Section */}
              <div className="grid grid-cols-2 gap-4 w-full pt-6 border-t border-white/5">
                <button onClick={() => handleCopy(veloId, 'id')} className="text-center group">
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em] mb-1 group-hover:text-velo-cyan transition-colors">Velo ID</p>
                  <div className="flex items-center justify-center gap-1.5 bg-black/20 py-2 rounded-xl border border-white/5 group-hover:border-velo-cyan/30 transition-all">
                    <span className="text-xs font-mono text-white/90">{veloId}</span>
                    {copiedId ? <Check size={12} className="text-velo-green" /> : <Copy size={12} className="text-gray-600" />}
                  </div>
                </button>
                <button onClick={() => handleCopy(accountId || '', 'addr')} className="text-center group">
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em] mb-1 group-hover:text-velo-cyan transition-colors">Wallet</p>
                  <div className="flex items-center justify-center gap-1.5 bg-black/20 py-2 rounded-xl border border-white/5 group-hover:border-velo-cyan/30 transition-all">
                    <span className="text-xs font-mono text-white/90">{accountId ? `${accountId.substring(0, 6)}...${accountId.substring(accountId.length-3)}` : 'Not Connected'}</span>
                    {copiedAddr ? <Check size={12} className="text-velo-green" /> : <Copy size={12} className="text-gray-600" />}
                  </div>
                </button>
              </div>
            </div>
          </section>

          {/* Tabbed Content Area */}
          <section className="bg-velo-card border border-velo-border rounded-[32px] overflow-hidden shadow-2xl">
            <div className="flex border-b border-velo-border">
              <button onClick={() => setActiveTab('portfolio')} className={`flex-1 py-4 text-sm font-black uppercase tracking-widest relative ${activeTab === 'portfolio' ? "text-white" : "text-gray-500 hover:text-gray-300"}`}>
                Portfolio {activeTab === 'portfolio' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-velo-cyan glow-cyan" />}
              </button>
              <button onClick={() => setActiveTab('activity')} className={`flex-1 py-4 text-sm font-black uppercase tracking-widest relative ${activeTab === 'activity' ? "text-white" : "text-gray-500 hover:text-gray-300"}`}>
                Activity {activeTab === 'activity' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-velo-cyan glow-cyan" />}
              </button>
            </div>

            <div className="p-6">
              {!isConnected ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                  <Wallet size={48} className="text-gray-700" />
                  <p className="text-gray-500 font-medium">Please connect your wallet to view your profile data.</p>
                </div>
              ) : activeTab === 'portfolio' ? (
                <div className="space-y-6">
                  <div className="bg-gradient-to-br from-velo-cyan/10 to-transparent border border-velo-cyan/20 rounded-2xl p-6">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Value</p>
                    {isLoadingPortfolio ? <Loader2 className="animate-spin text-velo-cyan" size={24} /> : <h2 className="text-3xl font-black text-white">${totalValue}</h2>}
                  </div>
                  <div className="space-y-3">
                    {isLoadingPortfolio ? (
                      [1, 2, 3].map(i => <div key={i} className="h-16 bg-white/5 animate-pulse rounded-2xl" />)
                    ) : portfolio.map((token) => (
                      <div key={token.ticker} className="flex items-center justify-between p-4 rounded-2xl bg-black/20 border border-white/5 hover:border-velo-cyan/20 transition-all group">
                        <div className="flex items-center gap-4">
                          <img src={token.icon} className="w-8 h-8 object-contain" alt="" />
                          <div>
                            <p className="text-sm font-bold text-white">{token.name}</p>
                            <p className="text-[10px] text-gray-500 uppercase tracking-widest">{token.ticker}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-white">{token.balance}</p>
                          <p className="text-[11px] font-bold text-velo-cyan/60">{token.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {isLoadingActivity ? (
                    [1, 2, 3].map(i => <div key={i} className="h-16 bg-white/5 animate-pulse rounded-2xl" />)
                  ) : activity.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-4 rounded-2xl bg-black/20 border border-white/5 hover:border-white/10 transition-all group">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${item.type === 'receive' ? "bg-velo-green/10 border-velo-green/20 text-velo-green" : "bg-velo-cyan/10 border-velo-cyan/20 text-velo-cyan"}`}>
                          {item.type === 'receive' ? <Plus size={18} /> : <Send size={18} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{item.action}</p>
                          <p className="text-[10px] text-gray-500 font-mono">{item.hash.substring(0, 16)}...</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-white">{item.value}</p>
                        <p className="text-[10px] font-bold text-gray-500">{item.time}</p>
                      </div>
                    </div>
                  ))}
                  {!isLoadingActivity && activity.length === 0 && <p className="text-center text-gray-500 py-8">No recent activity found.</p>}
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
