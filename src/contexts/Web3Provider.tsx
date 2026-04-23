"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { createAppKit, useAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { hederaTestnet } from "@reown/appkit/networks";
import { WagmiProvider, useAccount } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { useHederaAccount } from "@/hooks/useHederaAccount";
import { DAppSigner, hederaNamespace, HederaAdapter, HederaChainDefinition } from "@hashgraph/hedera-wallet-connect";
import { AccountId, LedgerId } from "@hiero-ledger/sdk";

// ─────────────────────────────────────────────────────────────────
// 1. Configuration Constants
// ─────────────────────────────────────────────────────────────────
const projectId = process.env.NEXT_PUBLIC_PROJECT_ID || "77347672d58ccce678cc86eee18c5918";
const networks = [hederaTestnet];
const wagmiAdapter = new WagmiAdapter({ networks, projectId });

const VELO_MANUAL_DISCONNECT_KEY = "velo_manual_disconnect";

// ─────────────────────────────────────────────────────────────────
// 2. AppKit Initialization
// ─────────────────────────────────────────────────────────────────
const hederaNativeNetworks = [HederaChainDefinition.Native.Testnet];

export const modal = createAppKit({
  adapters: [
    wagmiAdapter, 
    new HederaAdapter({ 
      projectId, 
      networks: hederaNativeNetworks as any, 
      namespace: hederaNamespace
    })
  ] as any,
  networks: [...networks, ...hederaNativeNetworks] as [any, ...any[]],
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
  optionalNamespaces: {
    hedera: {
      chains: ["hedera:296", "hedera:testnet"],
      methods: [
        "hedera_signAndExecuteTransaction",
        "hedera_executeTransaction",
        "hedera_signTransaction",
        "hedera_signMessage",
      ],
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
  hederaAccountId: string | null;
  balance: string;
  isRefreshingBalance: boolean;
  open: () => void;
  disconnect: () => void;
  connector: any;
  walletInterface: {
    walletType: "hedera" | "metamask";
    hederaAccountId: string | null;
    address: string | null;
    getSigner: () => Promise<any>;
    executeSwap: (type: "hedera" | "metamask", txData: any) => Promise<{ hash: string, transactionId: string, status: string }>;
  } | null;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

// ─────────────────────────────────────────────────────────────────
// 4. Inner Provider Implementation
// ─────────────────────────────────────────────────────────────────
function Web3InnerProvider({ children }: { children: React.ReactNode }) {
  const { open } = useAppKit();
  const { address, isConnected, connector } = useAccount();
  const { hederaAccountId } = useHederaAccount(address);
  const [nativeBalance, setNativeBalance] = useState("0.00");
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);

  const fullDisconnect = useCallback(() => {
    localStorage.setItem(VELO_MANUAL_DISCONNECT_KEY, "true");
    modal.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const wasManuallyDisconnected = localStorage.getItem(VELO_MANUAL_DISCONNECT_KEY) === "true";
    if (wasManuallyDisconnected && isConnected) {
      fullDisconnect();
    }
  }, [isConnected, fullDisconnect]);

  // Wallet Detection
  const walletType = useMemo(() => {
    if (typeof window !== "undefined") {
      if ((window as any).ethereum?.isMetaMask) return "metamask";
      if ((window as any).hashgraph || (window as any).hedera) return "hedera";
    }
    if (connector?.name?.toLowerCase().includes("metamask")) return "metamask";
    return "hedera";
  }, [connector]);

  const walletInterface = useMemo(() => {
    if (!isConnected || !connector || !address || !hederaAccountId) return null;
    
    return {
      walletType: walletType as "hedera" | "metamask",
      hederaAccountId,
      address,

      getSigner: async () => {
        const provider = await (modal as any).getProvider();
        if (provider?.session && provider?.client) {
          return new DAppSigner(AccountId.fromString(hederaAccountId), provider.client, provider.session.topic, LedgerId.TESTNET);
        }
        if (typeof window !== "undefined") {
          const native = (window as any).hashgraph || (window as any).hedera;
          if (native) return native;
        }
        throw new Error("No signer available.");
      },

      executeSwap: async (type: "hedera" | "metamask", txData: any) => {
        const provider = await (connector as any).getProvider();
        if (!provider) throw new Error("No provider available");

        // STRICT GUARD
        if (type === "metamask" && (typeof txData === "string" || txData.signerAccountId)) {
          throw new Error("MetaMask cannot execute native Hedera RPC methods.");
        }
        if (type === "hedera" && txData.data && !txData.transactionList) {
          throw new Error("Hedera wallets require transactionList for native RPC.");
        }

        if (type === "metamask") {
          console.log("[RPC] Executing via MetaMask (eth_sendTransaction)...");
          const hash = await provider.request({
            method: "eth_sendTransaction",
            params: [txData] // txData is { from, to, data, value }
          });
          return { hash, transactionId: hash, status: "SUCCESS" };
        } else {
          console.log("[RPC] Executing via Hedera Native (hedera_signAndExecuteTransaction)...");
          const result = await provider.request({
            method: "hedera_signAndExecuteTransaction",
            params: {
              signerAccountId: hederaAccountId,
              transactionList: txData // base64
            }
          });
          return {
            hash: result.transactionHash || (typeof result === 'string' ? result : result.transactionId),
            transactionId: result.transactionId || result,
            status: "SUCCESS"
          };
        }
      }
    };
  }, [isConnected, connector, address, hederaAccountId, walletType]);

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
// 5. Public API
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

export function useWeb3() {
  const context = useContext(Web3Context);
  if (!context) throw new Error("useWeb3 must be used within Web3Provider");
  return context;
}
