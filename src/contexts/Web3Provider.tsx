"use client";

import { createWeb3Modal, defaultWagmiConfig } from '@web3modal/wagmi/react'
import { WagmiProvider } from 'wagmi'
import { hederaTestnet } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashConnect } from 'hashconnect'
import { LedgerId } from '@hashgraph/sdk'
import React, { useEffect, useState, useMemo } from 'react'

const queryClient = new QueryClient()

// Provided Project ID for WalletConnect / Web3Modal
const projectId = '77347672d58ccce678cc86eee18c5918';

const metadata = {
  name: 'Velo dApp',
  description: 'High-velocity Hedera DeFi dApp',
  url: 'https://velo-swart.vercel.app',
  icons: ['https://avatars.githubusercontent.com/u/37784886']
}

// 1. Create default Wagmi Config (SSR Friendly)
const chains = [hederaTestnet] as const
const wagmiConfig = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
})

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // 2. Initialize Web3Modal (Client side only)
    createWeb3Modal({
      wagmiConfig,
      projectId,
      enableAnalytics: false,
      themeVariables: {
        '--w3m-accent': '#06b6d4',
        '--w3m-background-color': '#0b0e14',
      }
    });

    // 3. Initialize HashConnect (Client side only)
    const hc = new HashConnect(
      LedgerId.TESTNET,
      projectId,
      metadata,
      true
    );
    hc.init();
  }, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
        {mounted && <CustomToaster />}
      </QueryClientProvider>
    </WagmiProvider>
  )
}

/**
 * Manual Toast Implementation (Velo Styled)
 * Bypasses persistent network failures for 'sonner' package while maintaining 
 * the requested Obsidian/Cyan aesthetic for the grant milestone.
 */
function CustomToaster() {
  const [toasts, setToasts] = useState<{id: number, message: string, type: 'error' | 'success'}[]>([]);

  useEffect(() => {
    // Expose toaster to window for global access
    (window as any).veloToast = (message: string, type: 'error' | 'success' = 'error') => {
      const id = Date.now();
      setToasts(prev => [...prev, {id, message, type}]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 5000);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-[320px] px-4 pointer-events-none transition-all">
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto bg-[#0b0e14] border border-velo-cyan/50 rounded-xl p-4 shadow-2xl animate-in slide-in-from-bottom-4 flex items-center justify-center text-center">
          <p className="text-xs font-medium text-white tracking-tight">{toast.message}</p>
        </div>
      ))}
    </div>
  );
}
