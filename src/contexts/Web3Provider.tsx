"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { createAppKit, useAppKit, useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { hedera, hederaTestnet } from "@reown/appkit/networks";
import { WagmiProvider, useBalance } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";

// 1. Get Project ID
const projectId = process.env.NEXT_PUBLIC_PROJECT_ID || "77347672d58ccce678cc86eee18c5918";

// 2. Create the Wagmi Adapter (Pinned v1.1.x Pattern)
const networks = [hedera, hederaTestnet];
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
});

// 3. Configure AppKit (Reown v1.1.x)
createAppKit({
  adapters: [wagmiAdapter],
  networks: networks as [any, ...any[]],
  projectId,
  metadata: {
    name: "Velo",
    description: "High-velocity Hedera DeFi dApp",
    url: "https://velo-swart.vercel.app/",
    icons: ["https://i.imgur.com/uF9BXZ8.png"],
  },
  features: {
    analytics: true,
    socials: ["google", "apple", "facebook"],
    email: true,
  },
  themeVariables: {
    "--w3m-accent": "#06b6d4",
    "--w3m-border-radius-master": "16px",
  },
  allWallets: "SHOW",
});

// Create Query Client
const queryClient = new QueryClient();

interface Web3ContextType {
  isConnected: boolean;
  address: string | null;
  balance: string;
  open: () => void;
  disconnect: () => void;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

/**
 * Inner component to handle Wagmi hooks correctly within a Provider context
 */
function BalanceWatcher({ 
  onBalanceUpdate, 
  address, 
  isConnected 
}: { 
  onBalanceUpdate: (bal: string) => void, 
  address: string | undefined, 
  isConnected: boolean 
}) {
  const { data: balanceData } = useBalance({
    address: isConnected ? (address as `0x${string}`) : undefined,
  });

  useEffect(() => {
    if (balanceData) {
      onBalanceUpdate(`${parseFloat(balanceData.formatted).toFixed(2)}`);
    } else {
      onBalanceUpdate("0.00");
    }
  }, [balanceData, onBalanceUpdate]);

  return null;
}

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const [balance, setBalance] = useState("0.00");

  // Task 3: ECDSA Warning Logic
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof window !== "undefined" && (window as any).hashpack_connection_error) {
        toast.error("Connection Error", {
          description: "Please ensure your HashPack account is an ECDSA-type account (ED25519 is not supported by WalletConnect).",
          duration: 6000,
        });
        (window as any).hashpack_connection_error = false;
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!mounted) return null;

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BalanceWatcher 
          address={address} 
          isConnected={!!isConnected} 
          onBalanceUpdate={setBalance} 
        />
        <Web3Context.Provider value={{
          isConnected: !!isConnected,
          address: address || null,
          balance,
          open,
          disconnect: () => wagmiAdapter.wagmiConfig.storage?.removeItem("wagmi.store"),
        }}>
          {children}
          <Toaster theme="dark" position="top-center" richColors closeButton />
        </Web3Context.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
}
