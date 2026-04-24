"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { createAppKit, useAppKit, useAppKitProvider } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { hederaTestnet } from "@reown/appkit/networks";
import { WagmiProvider, useAccount, useDisconnect } from "wagmi";
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
  connectExtension: () => Promise<void>;
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
  const { address: wagmiAddress, isConnected: wagmiIsConnected, connector } = useAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();

  // Native Connection State (for HashPack / Blade Direct)
  const [isNative, setIsNative] = useState(false);
  const [nativeAccountId, setNativeAccountId] = useState<string | null>(null);
  const [nativeAddress, setNativeAddress] = useState<string | null>(null);

  const { hederaAccountId: wagmiHederaId } = useHederaAccount(wagmiAddress || null);
  
  const isConnected = wagmiIsConnected || isNative;
  const address = wagmiAddress || nativeAddress;
  const hederaAccountId = wagmiHederaId || nativeAccountId;

  const [nativeBalance, setNativeBalance] = useState("0.00");
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!hederaAccountId) {
      setNativeBalance("0.00");
      return;
    }
    setIsRefreshingBalance(true);
    try {
      const response = await fetch(
        `https://testnet.mirrornode.hedera.com/api/v1/accounts/${hederaAccountId}`
      );
      if (response.ok) {
        const data = await response.json();
        const rawBalance = data.balance?.balance || 0;
        setNativeBalance((rawBalance / 100000000).toFixed(2));
      }
    } catch (error) {
      console.error("[Web3Provider] Failed to fetch balance:", error);
    } finally {
      setIsRefreshingBalance(false);
    }
  }, [hederaAccountId]);

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 10000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  const connectExtension = useCallback(async () => {
    if (typeof window === "undefined") return;
    const native = (window as any).hashgraph || (window as any).hedera;
    
    if (!native) {
      toast.error("No Hedera Extension Found", { 
        description: "Please install HashPack or Blade wallet extension." 
      });
      return;
    }

    try {
      const response = await native.connect();
      if (response && response.accountIds && response.accountIds.length > 0) {
        const accId = response.accountIds[0];
        setNativeAccountId(accId);
        // Direct extensions often don't provide the EVM address immediately, 
        // but we can infer it or just use the account ID as the key.
        setNativeAddress(accId); 
        setIsNative(true);
        toast.success("Connected via Extension!");
      }
    } catch (error: any) {
      console.error("[Web3Provider] Native Connection Failed:", error);
      toast.error("Connection Failed", { description: error.message });
    }
  }, []);

  const fullDisconnect = useCallback(() => {
    localStorage.setItem(VELO_MANUAL_DISCONNECT_KEY, "true");
    setIsNative(false);
    setNativeAccountId(null);
    setNativeAddress(null);
    wagmiDisconnect();
  }, [wagmiDisconnect]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    if (wagmiIsConnected) {
      localStorage.setItem(VELO_MANUAL_DISCONNECT_KEY, "false");
    }
  }, [wagmiIsConnected]);

  // Wallet Detection
  const walletType = useMemo(() => {
    if (typeof window !== "undefined") {
      if ((window as any).ethereum?.isMetaMask) return "metamask";
      if ((window as any).hashgraph || (window as any).hedera) return "hedera";
    }
    if (connector?.name?.toLowerCase().includes("metamask")) return "metamask";
    return "hedera";
  }, [connector]);

  const { walletProvider } = (useAppKitProvider as any)("hedera");

  const walletInterface = useMemo(() => {
    if (!isConnected || !connector || !address || !hederaAccountId) return null;
    
    return {
      walletType: walletType as "hedera" | "metamask",
      hederaAccountId,
      address,

      getSigner: async () => {
        // Path A: WalletConnect / AppKit Provider (via hook)
        let provider = walletProvider;
        let sessionTopic = (provider as any)?.session?.topic;

        // Try getting provider from connector if hook is empty
        if (!provider && connector) {
          try {
            provider = await (connector as any).getProvider();
            sessionTopic = (provider as any)?.session?.topic;
          } catch (e) {
            console.warn("[Web3Provider] Failed to get provider from connector:", e);
          }
        }

        if (provider && sessionTopic) {
          return new DAppSigner(
            AccountId.fromString(hederaAccountId),
            provider as any,
            sessionTopic
          );
        }

        // Path B: Fallback to Native Extensions (HashPack / Blade)
        if (typeof window !== "undefined") {
          const native = (window as any).hashgraph || (window as any).hedera;
          if (native) return native;
        }

        // The Guardrail:
        const msg = "Signer state lost. This can happen after a page refresh or if the wallet session timed out.\n\n" +
                    "Action Required:\n" +
                    "1. If using a Browser Extension (HashPack/Blade), ensure it is unlocked.\n" +
                    "2. If using WalletConnect, please DISCONNECT and reconnect to restore the bridge.";
        alert(msg);
        throw new Error("No signer available. Re-connection required.");
      },

      executeSwap: async (type: "hedera" | "metamask", txData: any) => {
        // Path A: Native Extension
        if (isNative) {
          const native = (window as any).hashgraph || (window as any).hedera;
          if (!native) throw new Error("Native extension not found");
          
          console.log("[RPC] Executing via Native Extension (hedera_signAndExecuteTransaction)...");
          const result = await native.request({
            method: "hedera_signAndExecuteTransaction",
            params: {
              signerAccountId: hederaAccountId,
              transactionList: txData
            }
          });
          return {
            hash: result.transactionHash || (typeof result === 'string' ? result : result.transactionId),
            transactionId: result.transactionId || result,
            status: "SUCCESS"
          };
        }

        // Path B: Wagmi/AppKit Provider
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
            params: [txData] 
          });
          return { hash, transactionId: hash, status: "SUCCESS" };
        } else {
          console.log("[RPC] Executing via Hedera Native (hedera_signAndExecuteTransaction)...");
          const result = await provider.request({
            method: "hedera_signAndExecuteTransaction",
            params: {
              signerAccountId: hederaAccountId,
              transactionList: txData 
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
    connectExtension,
    disconnect: fullDisconnect,
    connector,
    walletInterface
  }), [isConnected, address, hederaAccountId, nativeBalance, isRefreshingBalance, open, connectExtension, fullDisconnect, connector, walletInterface]);

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
