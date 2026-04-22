"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { createAppKit, useAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { hedera, hederaTestnet } from "@reown/appkit/networks";
import { WagmiProvider, useBalance, useDisconnect, useAccount } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { useHederaAccount } from "@/hooks/useHederaAccount";
import { useHederaBalance } from "@/hooks/useHederaBalance";
import { HederaJsonRpcMethod, DAppSigner, hederaNamespace } from "@hashgraph/hedera-wallet-connect";
import { AccountId, TransactionId, LedgerId } from "@hiero-ledger/sdk";

// ─────────────────────────────────────────────────────────────────
// 1. Configuration Constants
// ─────────────────────────────────────────────────────────────────
const projectId = process.env.NEXT_PUBLIC_PROJECT_ID || "77347672d58ccce678cc86eee18c5918";
const networkType = process.env.NEXT_PUBLIC_NETWORK_TYPE || "testnet";
const networks = networkType === "mainnet" ? [hedera, hederaTestnet] : [hederaTestnet];
const wagmiAdapter = new WagmiAdapter({ networks, projectId });

const VELO_MANUAL_DISCONNECT_KEY = "velo_manual_disconnect";

// ─────────────────────────────────────────────────────────────────
// 2. AppKit Initialization
// ─────────────────────────────────────────────────────────────────
const modal = createAppKit({
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
  // Request official Hedera namespace permissions
  optionalNamespaces: {
    hedera: hederaNamespace,
  },
} as any);

const queryClient = new QueryClient();

// ─────────────────────────────────────────────────────────────────
// 3. Web3 Context Definition
// ─────────────────────────────────────────────────────────────────
interface Web3ContextType {
  isConnected: boolean;
  address: string | null;
  /** Resolved native ID (0.0.x) */
  hederaAccountId: string | null;
  balance: string;
  /** True when balance is being refreshed from Mirror Node */
  isRefreshingBalance: boolean;
  open: () => void;
  disconnect: () => void;
  connector: any;
  /** Official Hedera Signing Interface compatibility */
  walletInterface: {
    getSigner: () => any;
  } | null;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

// ─────────────────────────────────────────────────────────────────
// 4. Inner Provider (Direct Wagmi Reactor)
// ─────────────────────────────────────────────────────────────────
/**
 * This component runs *inside* WagmiProvider. It uses standard Wagmi
 * hooks as the absolute source of truth for reactive state.
 */
function Web3InnerProvider({ children }: { children: React.ReactNode }) {
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const { address, isConnected, connector } = useAccount();

  // ── Native Hedera Resolution ──────────────────────────────
  const { hederaAccountId } = useHederaAccount(isConnected && address ? address : null);
  const { balance: nativeBalance, isLoading: isRefreshingBalance } = useHederaBalance(hederaAccountId);

  const [prevAddress, setPrevAddress] = useState<string | undefined>(undefined);

  // Sync account changes
  useEffect(() => {
    if (address && prevAddress && address !== prevAddress) {
      toast.info("Account Changed", {
        description: "Wallet account has been switched.",
        duration: 4000,
      });
    }
    setPrevAddress(address);
  }, [address, prevAddress]);

  // Log connection lifecycle
  useEffect(() => {
    if (isConnected && address) {
      console.log(`[Web3Inner] Connected: ${address}`);
      // Clear manual disconnect flag since user is successfully linked
      localStorage.removeItem(VELO_MANUAL_DISCONNECT_KEY);
    }
  }, [isConnected, address]);

  // Wrapped full disconnect
  const fullDisconnect = useCallback(() => {
    console.log("[Web3Inner] Triggering full disconnect...");
    disconnect();
    clearWcStorage();
    localStorage.setItem(VELO_MANUAL_DISCONNECT_KEY, "true");
    toast.success("Disconnected", {
      description: "Wallet session has been cleared.",
      duration: 3000,
    });
  }, [disconnect]);

  // Suppress auto-reconnect if manually disconnected
  useEffect(() => {
    if (typeof window === "undefined") return;
    const wasManuallyDisconnected =
      localStorage.getItem(VELO_MANUAL_DISCONNECT_KEY) === "true";
    
    if (wasManuallyDisconnected && isConnected) {
      console.warn("[Web3Inner] Suppressing unwanted auto-reconnect.");
      fullDisconnect();
    }
  }, [isConnected, fullDisconnect]);

  // ── Wallet Interface Compatibility ──────────────────────────
  const walletInterface = useMemo(() => {
    if (!isConnected || !connector || !address || !hederaAccountId) return null;
    
    return {
      getSigner: async () => {
        // 1. Get the underlying provider from AppKit
        const provider = await (modal as any).getProvider();
        if (!provider) throw new Error("No provider available");

        // 2. Case: WalletConnect (HIP-820 / Native Hedera Handshake)
        if (provider.session && provider.client) {
          console.log("[Web3Provider] Using DAppSigner for WalletConnect session.");
          return new DAppSigner(
            AccountId.fromString(hederaAccountId),
            provider.client,
            provider.session.topic,
            networkType === "mainnet" ? LedgerId.MAINNET : LedgerId.TESTNET
          );
        }

        // 3. Case: Injected (EIP-1193 / HashPack Extension)
        // For injected wallets in this pilot, we fall back to the native provider 
        // if available, or throw a descriptive error for native Hedera SDK calls.
        console.warn("[Web3Provider] Injected wallet detected. Native Hedera SDK Signer bridge is limited.");
        
        // Return null or a descriptive error for now to prevent hard crash
        throw new Error("Native Hedera operations (like Association) currently require a WalletConnect connection (e.g. HashPack Mobile/Link). We are working on Extension support.");
      }
    };
  }, [isConnected, connector, address, hederaAccountId, networkType]);

  const value = useMemo(() => ({
    isConnected: !!isConnected,
    address: address || null,
    hederaAccountId,
    balance: nativeBalance,
    isRefreshingBalance,
    open,
    disconnect: fullDisconnect,
    connector,
    walletInterface
  }), [isConnected, address, hederaAccountId, nativeBalance, isRefreshingBalance, open, fullDisconnect, connector, walletInterface]);

  return (
    <Web3Context.Provider value={value}>
      {children}
    </Web3Context.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────
// 5. Outer Provider (Initialization)
// ─────────────────────────────────────────────────────────────────
export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <Web3InnerProvider>
          {children}
          <Toaster theme="dark" position="top-center" richColors closeButton />
        </Web3InnerProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// ─────────────────────────────────────────────────────────────────
// 6. Public API
// ─────────────────────────────────────────────────────────────────
export function useWeb3() {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
}

/**
 * Purge all WalletConnect, Wagmi, and AppKit keys from storage.
 */
function clearWcStorage() {
  if (typeof window === "undefined") return;

  const storageKeys = [
    "wc@2", "wagmi", "hashconnect", "@appkit", "W3M", "reown"
  ];

  const doClear = (storage: Storage) => {
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && storageKeys.some(sk => key.startsWith(sk))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => storage.removeItem(k));
  };

  doClear(localStorage);
  doClear(sessionStorage);
}
