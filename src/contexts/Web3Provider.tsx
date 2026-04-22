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
export const modal = createAppKit({
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
  // Force-inject official Hedera native permissions
  requiredNamespaces: {
    hedera: {
      methods: [
        "hedera_signAndExecuteTransaction",
        "hedera_signTransaction",
        "hedera_signMessage",
      ],
      chains: [networkType === "mainnet" ? "hedera:mainnet" : "hedera:testnet"],
      events: ["chainChanged", "accountsChanged"],
    },
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
  /** Universal Wallet Interface for Hedera Operations */
  walletInterface: {
    getSigner: () => Promise<any>;
    /** For MetaMask / EVM: Use HTS Precompile */
    associateToken?: (tokenId: string) => Promise<any>;
    /** For Extensions / Bridge: Execute native SDK transaction */
    executeTransaction?: (transaction: any) => Promise<any>;
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
        const provider = await (modal as any).getProvider();
        if (!provider) throw new Error("No provider available");

        if (provider.session && provider.client) {
          return new DAppSigner(
            AccountId.fromString(hederaAccountId),
            provider.client,
            provider.session.topic,
            networkType === "mainnet" ? LedgerId.MAINNET : LedgerId.TESTNET
          );
        }
        throw new Error("DAppSigner requires WalletConnect session.");
      },

      associateToken: async (tokenIdStr: string) => {
        // Path A: MetaMask / EVM Precompile
        if (connector.name.toLowerCase().includes("metamask")) {
          console.log("[Web3Provider] Using MetaMask Precompile Association...");
          // HTS Precompile Associate: associate(address,address[])
          const HTS_PRECOMPILE = "0x0000000000000000000000000000000000000167";
          const tokenAddress = `0x${AccountId.fromString(tokenIdStr).toSolidityAddress()}`;
          
          // Note: This assumes Wagmi's useWriteContract or similar, 
          // but since we are in a context, we can use the provider directly.
          const provider = await (connector as any).getProvider();
          // For now, we will let the component handle the specific viem call if needed,
          // but we'll provide the logic here.
          throw new Error("MetaMask association should be handled via Wagmi writeContract.");
        }
      },

      executeTransaction: async (transaction: any) => {
        const provider = await (connector as any).getProvider();
        if (!provider) throw new Error("No provider available");

        // Path C: Native Extension (HashPack/Blade)
        // Many extensions support hedera_signAndExecuteTransaction
        console.log("[Web3Provider] Executing via Injected Extension Provider...");
        
        // This is a bridge: extensions expect the transaction bytes
        const bytes = transaction.toBytes();
        const params = [
          Buffer.from(bytes).toString("base64")
        ];

        return await provider.request({
          method: "hedera_signAndExecuteTransaction",
          params: params
        });
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
