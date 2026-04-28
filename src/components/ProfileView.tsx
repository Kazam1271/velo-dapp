"use client";

import { useState, useRef, useEffect } from "react";
import nextDynamic from "next/dynamic";
import { 
  User, 
  Edit2, 
  Copy, 
  Check, 
  X,
  ArrowRightLeft, 
  ArrowUpRight,
  ArrowDownLeft,
  Plus, 
  Send, 
  Download,
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
import { supabase } from "@/lib/supabase";
interface TokenBalance {
  name: string;
  ticker: string;
  balance: string;
  value: string;
  price: number;
  icon: string;
  iconBg?: string;
}

interface ActivityItem {
  action: string;
  path: string;
  value: string;
  time: string;
  type: 'swap' | 'pool' | 'transfer' | 'receive' | 'sent' | 'contract';
  status: 'success' | 'pending';
  hash: string;
  asset?: string;
}

export default function ProfileView() {
  const { pairingData, isConnected } = useHashConnect();
  const accountId = pairingData?.accountIds?.[0] || null;
  
  const [activeTab, setActiveTab] = useState<'portfolio' | 'activity'>('portfolio');
  const [copiedId, setCopiedId] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  
  // Profile Interactivity States
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live Data States
  const [portfolio, setPortfolio] = useState<TokenBalance[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [isLoadingPortfolio, setIsLoadingPortfolio] = useState(false);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [totalValue, setTotalValue] = useState("0.00");

  const [veloId, setVeloId] = useState('Not Connected');
  
  useEffect(() => {
    if (accountId && typeof window !== 'undefined') {
      const fetchProfile = async () => {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('velo_id, avatar_url')
            .eq('wallet_id', accountId)
            .single();
          
          if (data && data.velo_id) {
            setVeloId(data.velo_id);
            if (data.avatar_url) setAvatarUrl(data.avatar_url);
          } else if (error?.code === 'PGRST116' || !data) {
            // Generate and save new Velo ID
            const randomString = Math.random().toString(36).substring(2, 10).toUpperCase();
            const newVeloId = `V-${randomString}`;
            
            await supabase.from('profiles').upsert({ 
              wallet_id: accountId, 
              velo_id: newVeloId 
            });
            setVeloId(newVeloId);
          }
        } catch (err) {
          console.error("Error fetching/creating profile from Supabase:", err);
          setVeloId('V-ERROR');
        }
      };

      fetchProfile();
    } else {
      setVeloId('Not Connected');
      setAvatarUrl(null);
    }
  }, [accountId]);

  // ── Fetch Live Data ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!accountId) {
      setPortfolio([]);
      setActivity([]);
      setTotalValue("0.00");
      return;
    }

    const fetchData = async () => {
      setIsLoadingPortfolio(true);
      setIsLoadingActivity(true);

      try {
        // 1. Fetch real prices and icons from SaucerSwap (Defensive)
        let tokenDataMap = new Map();
        let tokenMetadataCache = new Map<string, { symbol: string, decimals: number }>();
        tokenMetadataCache.set('HBAR', { symbol: 'HBAR', decimals: 8 });

        try {
          const saucerResponse = await fetch('https://api.saucerswap.finance/tokens');
          const { TOKEN_LIST } = await import("@/config/tokens");
          
          // Pre-populate with local tokens first
          TOKEN_LIST.forEach(lt => {
            tokenDataMap.set(lt.symbol, {
              price: 0,
              icon: lt.logoURI,
              iconBg: lt.iconBg
            });
          });

          if (saucerResponse.ok) {
            const saucerTokens = await saucerResponse.json();
            saucerTokens.forEach((t: any) => {
              if (t.symbol) {
                const existing = tokenDataMap.get(t.symbol);
                tokenDataMap.set(t.symbol, {
                  price: t.priceUsd || 0,
                  icon: existing?.icon || (t.icon ? `https://www.saucerswap.finance${t.icon}` : null),
                  iconBg: existing?.iconBg || null
                });
              }
            });
          }
        } catch (dataError) {
          console.error("SaucerSwap data fetch failed, defaulting to $0:", dataError);
        }

        // 2. Fetch Balances
        const balRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/balances?account.id=${accountId}`);
        if (balRes.ok) {
          const balData = await balRes.json();
          const accountBal = balData.balances?.[0] || { balance: 0, tokens: [] };
          
          const hbarData = tokenDataMap.get('WHBAR') || tokenDataMap.get('HBAR') || { price: 0.08, icon: '/hbar.png' };
          const hbarPrice = parseFloat(hbarData.price?.toString() || '0.08');
          const hbarBalValue = (accountBal.balance / 100000000);
          const tokens: TokenBalance[] = [
            { 
              name: 'Hedera', 
              ticker: 'HBAR', 
              balance: hbarBalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 
              value: `$${(hbarBalValue * hbarPrice).toFixed(2)}`, 
              price: hbarPrice,
              icon: hbarData.icon || '/hbar.png',
              iconBg: '#000000'
            }
          ];

          // 3. Fetch metadata for each token (Highly Defensive Loop)
          if (accountBal.tokens && accountBal.tokens.length > 0) {
            const enrichedTokens = await Promise.all(
              accountBal.tokens.map(async (token: any) => {
                try {
                  const tokenInfoRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/tokens/${token.token_id}`);
                  const tokenInfo = tokenInfoRes.ok ? await tokenInfoRes.json() : {};
                  
                  const decimals = tokenInfo.decimals ? parseInt(tokenInfo.decimals) : 0;
                  const rawSymbol = tokenInfo.symbol || 'UNKNOWN';
                  const cleanSymbol = rawSymbol.replace('(Mock)', '').trim();
                  
                  // Update cache for Activity Tab
                  tokenMetadataCache.set(token.token_id, { symbol: cleanSymbol, decimals });

                  const trueBalance = token.balance / Math.pow(10, decimals);
                  if (trueBalance === 0) return null;

                  // Match by ID for precise icons
                  const { TOKEN_LIST } = await import("@/config/tokens");
                  const localToken = TOKEN_LIST.find(lt => lt.tokenId === token.token_id);
                  
                  // VELO wildcard: hardcode $0.01 target price until pool launches
                  const isVelo = cleanSymbol.toUpperCase() === 'VELO';
                  const saucerData = tokenDataMap.get(cleanSymbol) || { price: 0, icon: null };
                  const tokenPrice = isVelo ? 0.01 : parseFloat(saucerData.price?.toString() || '0');
                  const calculatedUsdValue = trueBalance * tokenPrice;

                  return {
                    name: tokenInfo.name || `Token ${token.token_id.split('.').pop()}`,
                    ticker: rawSymbol,
                    balance: trueBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }),
                    value: calculatedUsdValue > 0 ? `$${calculatedUsdValue.toFixed(2)}` : "$0.00",
                    price: tokenPrice,
                    icon: localToken?.logoURI || saucerData.icon || "/logov.png",
                    iconBg: localToken?.iconBg || saucerData.iconBg || '#000000'
                  };
                } catch (error) {
                  console.error(`Failed to process token ${token.token_id}:`, error);
                  return null;
                }
              })
            );

            enrichedTokens.forEach(t => {
              if (t) tokens.push(t);
            });
          }

          setPortfolio(tokens);
          const grandTotal = tokens.reduce((acc, curr) => {
            const val = parseFloat(curr.value.replace('$', '').replace(',', ''));
            return acc + (isNaN(val) ? 0 : val);
          }, 0);
          setTotalValue(grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        }

        // 4. Fetch Activity (Advanced Smart Parsing)
        const actRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/transactions?account.id=${accountId}&limit=20&order=desc`);
        if (actRes.ok) {
          const actData = await actRes.json();
          const items: ActivityItem[] = actData.transactions.map((tx: any) => {
            try {
              const hbarTransfers = tx.transfers || [];
              const tokenTransfers = tx.token_transfers || [];
              
              const userHbarChange = hbarTransfers
                .filter((tf: any) => {
                  const accNum = parseInt(tf.account.split('.').pop());
                  return !(accNum >= 3 && accNum <= 29);
                })
                .reduce((acc: number, tf: any) => tf.account === accountId ? acc + tf.amount : acc, 0);

              const userTokenChanges = tokenTransfers.filter((tf: any) => tf.account === accountId);
              
              let actionLabel = 'Transaction';
              let actionType: ActivityItem['type'] = 'transfer';
              let assetDisplay = '';
              let usdValue = 0;

              // ── Logic: Identify Swap ──
              if (userTokenChanges.length >= 2 || (userTokenChanges.length === 1 && Math.abs(userHbarChange) > 10000000)) {
                actionType = 'swap';
                const outToken = userTokenChanges.find((t: any) => t.amount < 0) || (userHbarChange < 0 ? { token_id: 'HBAR', amount: userHbarChange } : null);
                const inToken = userTokenChanges.find((t: any) => t.amount > 0) || (userHbarChange > 0 ? { token_id: 'HBAR', amount: userHbarChange } : null);
                
                if (outToken && inToken) {
                  const metaOut = tokenMetadataCache.get(outToken.token_id) || { symbol: outToken.token_id, decimals: 8 };
                  const metaIn = tokenMetadataCache.get(inToken.token_id) || { symbol: inToken.token_id, decimals: 8 };
                  const amtOut = Math.abs(outToken.amount) / Math.pow(10, metaOut.decimals);
                  const amtIn = Math.abs(inToken.amount) / Math.pow(10, metaIn.decimals);
                  
                  actionLabel = `Swapped ${amtOut.toFixed(2)} ${metaOut.symbol} for ${amtIn.toFixed(2)} ${metaIn.symbol}`;
                  assetDisplay = 'Velo DEX';
                } else {
                  actionLabel = 'Swapped Assets';
                }
              } 
              // ── Logic: Identify Sent ──
              else if (userHbarChange < -5000000 || userTokenChanges.some((t: any) => t.amount < 0)) {
                actionType = 'transfer';
                const mainToken = userTokenChanges.find((t: any) => t.amount < 0) || { token_id: 'HBAR', amount: userHbarChange };
                const meta = tokenMetadataCache.get(mainToken.token_id) || { symbol: mainToken.token_id, decimals: 8 };
                const amt = Math.abs(mainToken.amount) / Math.pow(10, meta.decimals);
                
                // Find recipient
                const recipient = mainToken.token_id === 'HBAR' 
                  ? hbarTransfers.find((tf: any) => tf.amount > 0 && tf.account !== accountId)?.account 
                  : tokenTransfers.find((tf: any) => tf.token_id === mainToken.token_id && tf.amount > 0 && tf.account !== accountId)?.account;

                actionLabel = `Sent ${amt.toFixed(2)} ${meta.symbol}`;
                assetDisplay = recipient ? `To ${recipient}` : 'Direct Transfer';
                usdValue = amt * (tokenDataMap.get(meta.symbol)?.price || 0);
              }
              // ── Logic: Identify Received ──
              else if (userHbarChange > 5000000 || userTokenChanges.some((t: any) => t.amount > 0)) {
                actionType = 'receive';
                const mainToken = userTokenChanges.find((t: any) => t.amount > 0) || { token_id: 'HBAR', amount: userHbarChange };
                const meta = tokenMetadataCache.get(mainToken.token_id) || { symbol: mainToken.token_id, decimals: 8 };
                const amt = Math.abs(mainToken.amount) / Math.pow(10, meta.decimals);

                // Find sender
                const sender = mainToken.token_id === 'HBAR' 
                  ? hbarTransfers.find((tf: any) => tf.amount < 0 && tf.account !== accountId)?.account 
                  : tokenTransfers.find((tf: any) => tf.token_id === mainToken.token_id && tf.amount < 0 && tf.account !== accountId)?.account;

                actionLabel = `Received ${amt.toFixed(2)} ${meta.symbol}`;
                assetDisplay = sender ? `From ${sender}` : 'Incoming Transfer';
                usdValue = amt * (tokenDataMap.get(meta.symbol)?.price || 0);
              }
              // ── Logic: Contract Interaction ──
              else if (tx.name.includes('CONTRACT')) {
                actionType = 'contract';
                actionLabel = 'Contract Interaction';
                assetDisplay = tx.transaction_id.split('@')[0];
              }

              const date = new Date(tx.consensus_timestamp * 1000);
              const formattedTime = `${new Date().toDateString() === date.toDateString() ? 'Today' : date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

              return {
                action: actionLabel,
                path: assetDisplay,
                value: usdValue > 0 ? `$${usdValue.toFixed(2)}` : '$0.00',
                time: formattedTime,
                type: actionType,
                status: 'success',
                hash: tx.transaction_id
              };
            } catch (err) {
              return null;
            }
          });
          setActivity(items.filter(Boolean));
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Guard: don't allow upload until the Velo ID has been loaded from Supabase
    if (!accountId || !veloId || veloId === 'Not Connected') {
      toast.error("Please wait for your profile to fully load before uploading.");
      return;
    }

    try {
      // 1. Create a temporary local preview so the UI feels fast
      const objectUrl = URL.createObjectURL(file);
      setAvatarUrl(objectUrl);

      // 2. Prepare the file for the backend
      const formData = new FormData();
      formData.append("file", file);

      // 3. Send to our Next.js API route
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.IpfsHash) {
        // 4. Construct the permanent IPFS gateway URL
        const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs/";
        const ipfsUrl = `${gatewayUrl}${data.IpfsHash}`;
        
        // 5. Save to Supabase — include velo_id to satisfy any NOT NULL constraint
        console.log("Attempting to link image to profile for:", accountId, "veloId:", veloId);

        const { error: dbError } = await supabase
          .from('profiles')
          .upsert({ 
            wallet_id: accountId, 
            avatar_url: ipfsUrl,
            velo_id: veloId,
          }, { onConflict: 'wallet_id' });

        if (dbError) {
          console.error("Supabase Link Error Details:", dbError.message, dbError.details);
          toast.error(`Link failed: ${dbError.message}`);
          setAvatarUrl(null);
          return;
        }
        
        // 6. Update the local UI state ONLY after DB success
        setAvatarUrl(ipfsUrl);
        toast.success("Profile updated!");
        console.log("Successfully pinned and persisted:", ipfsUrl);
      } else {
        throw new Error(data.error || "Upload failed");
      }
    } catch (error: any) {
      console.error("Error uploading to IPFS:", error);
      toast.error(`Upload failed: ${error.message}`);
      // Revert if failed
      setAvatarUrl(null);
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

  return (
    <div className="space-y-6">
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
              <div className="flex flex-col items-center gap-2">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Global Velo ID</p>
                <div className="flex items-center gap-3">
                  <div className="bg-slate-900/50 border border-slate-800 rounded-lg py-3 px-5 text-velo-cyan font-mono tracking-widest text-xl shadow-inner">
                    {veloId}
                  </div>
                  <button 
                    onClick={() => handleCopy(veloId, 'id')}
                    className="p-3 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all border border-white/5 shadow-md group"
                    title="Copy Velo ID"
                  >
                    {copiedId ? <Check size={20} className="text-velo-green" /> : <Copy size={20} className="group-hover:scale-110 transition-transform" />}
                  </button>
                </div>
              </div>
              {/* ID & Address Section */}
              <div className="grid grid-cols-2 gap-4 w-full pt-6 border-t border-white/5">
                <div className="text-center">
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em] mb-1">Status</p>
                  <div className="flex items-center justify-center gap-2 bg-black/20 py-2 rounded-xl border border-white/5">
                    <div className="w-2 h-2 rounded-full bg-velo-green glow-green"></div>
                    <span className="text-xs font-bold text-white/90">Verified</span>
                  </div>
                </div>
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
                          <div 
                            className="w-10 h-10 rounded-full overflow-hidden border border-white/5 flex items-center justify-center p-1.5 group-hover:border-velo-cyan/30 transition-all"
                            style={{ backgroundColor: token.iconBg || '#000000' }}
                          >
                            <img 
                              src={token.icon || '/logov.png'} 
                              alt={`${token.ticker} logo`} 
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = '/logov.png';
                              }}
                            />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">{token.name}</p>
                            <p className="text-[10px] text-gray-500 uppercase tracking-widest">{token.ticker}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-white">{token.balance}</p>
                          <p className="text-[11px] font-bold text-velo-cyan/60">{token.value}</p>
                          <p className="text-[10px] text-gray-600 font-mono">
                            {token.price > 0 
                              ? `$${token.price < 0.01 ? token.price.toFixed(6) : token.price.toFixed(4)} / token`
                              : token.ticker.replace('(Mock)','').trim() === 'VELO' ? '$0.01 target' : '—'
                            }
                          </p>
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
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors
                          ${item.type === 'receive' ? "bg-velo-green/10 border-velo-green/20 text-velo-green" : 
                            item.type === 'swap' ? "bg-velo-cyan/10 border-velo-cyan/20 text-velo-cyan" :
                            item.type === 'contract' ? "bg-purple-500/10 border-purple-500/20 text-purple-400" :
                            "bg-white/5 border-white/10 text-gray-400"}
                        `}>
                          {item.type === 'receive' ? <Download size={20} /> : 
                           item.type === 'transfer' ? <Send size={20} /> :
                           item.type === 'swap' ? <ArrowRightLeft size={20} /> :
                           item.type === 'contract' ? <History size={20} /> :
                           <Send size={20} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white line-clamp-1 max-w-[200px]">
                            {item.action}
                          </p>
                          <p className="text-[10px] text-gray-500 font-mono tracking-tighter truncate max-w-[150px]">
                            {item.path}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-black ${item.type === 'receive' ? "text-velo-green" : "text-white"}`}>
                          {item.type === 'receive' ? '+' : item.type === 'sent' ? '-' : ''}{item.value}
                        </p>
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
  );
}
