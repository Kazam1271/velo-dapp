"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createAppKit, useAppKit, useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { hedera, hederaTestnet } from "@reown/appkit/networks";
import { WagmiProvider, useBalance, useDisconnect, useAccount } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";

// ─────────────────────────────────────────────────────────────────
// 1. Project ID
// ─────────────────────────────────────────────────────────────────
const projectId = process.env.NEXT_PUBLIC_PROJECT_ID || "77347672d58ccce678cc86eee18c5918";

// ─────────────────────────────────────────────────────────────────
// 2. Wagmi Adapter (Pinned v2.12 / AppKit v1.1.x)
// ─────────────────────────────────────────────────────────────────
const networks = [hedera, hederaTestnet];
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
});

// ─────────────────────────────────────────────────────────────────
// 3. AppKit – configure ONCE at module level
// ─────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────
// 4. React Query client
// ─────────────────────────────────────────────────────────────────
const queryClient = new QueryClient();

// ─────────────────────────────────────────────────────────────────
// Local-storage key we write after a MANUAL disconnect so auto-
// reconnect does not kick in on the next page load.
// ─────────────────────────────────────────────────────────────────
const VELO_MANUAL_DISCONNECT_KEY = "velo_manual_disconnect";
const VELO_SESSION_VERIFIED_KEY = "velo_session_verified";

// ─────────────────────────────────────────────────────────────────
// Context shape
// ─────────────────────────────────────────────────────────────────
interface Web3ContextType {
  /** True only when wallet is connected AND session is verified */
  isConnected: boolean;
  /** Raw connection state from AppKit (before verification gate) */
  isWalletLinked: boolean;
  address: string | null;
  balance: string;
  /** Whether the user has verified (approved) this session */
  isSessionVerified: boolean;
  /** Opens the AppKit connect modal */
  open: () => void;
  /** Full disconnect: wagmi + WC session + localStorage cleanup */
  disconnect: () => void;
  /** Marks the current session as "verified" (approval click) */
  verifySession: () => void;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

// ─────────────────────────────────────────────────────────────────
// BalanceWatcher – must live *inside* WagmiProvider
// ─────────────────────────────────────────────────────────────────
function BalanceWatcher({
  onBalanceUpdate,
  address,
  isConnected,
}: {
  onBalanceUpdate: (bal: string) => void;
  address: string | undefined;
  isConnected: boolean;
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

// ─────────────────────────────────────────────────────────────────
// AccountChangeWatcher – fires when the user switches accounts in
// their wallet (e.g. HashPack account selector).
// ─────────────────────────────────────────────────────────────────
function AccountChangeWatcher({
  onAccountChange,
}: {
  onAccountChange: (addr: string | undefined) => void;
}) {
  const { address } = useAccount();
  useEffect(() => {
    onAccountChange(address);
  }, [address, onAccountChange]);
  return null;
}

// ─────────────────────────────────────────────────────────────────
// DisconnectHandler – provides wagmi's useDisconnect inside the
// WagmiProvider tree so we can call it from the context.
// ─────────────────────────────────────────────────────────────────
function DisconnectHandler({
  triggerRef,
}: {
  triggerRef: React.MutableRefObject<(() => void) | null>;
}) {
  const { disconnect } = useDisconnect();
  useEffect(() => {
    triggerRef.current = disconnect;
  }, [disconnect, triggerRef]);
  return null;
}

// ─────────────────────────────────────────────────────────────────
// Web3Provider – the exported provider component
// ─────────────────────────────────────────────────────────────────
export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { open } = useAppKit();
  const { address: appKitAddress, isConnected: appKitConnected } = useAppKitAccount();

  const [balance, setBalance] = useState("0.00");
  const [isSessionVerified, setIsSessionVerified] = useState(false);
  const [prevAddress, setPrevAddress] = useState<string | undefined>(undefined);

  // Ref so we can call wagmi's disconnect from outside the hook
  const wagmiDisconnectRef = React.useRef<(() => void) | null>(null);

  // ── Check for manual-disconnect flag on mount ──────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    const wasManuallyDisconnected =
      localStorage.getItem(VELO_MANUAL_DISCONNECT_KEY) === "true";

    if (wasManuallyDisconnected && appKitConnected) {
      // User manually disconnected last session – kill this
      // auto-reconnect immediately.
      setTimeout(() => {
        wagmiDisconnectRef.current?.();
        clearWcStorage();
      }, 200);
    }

    // Restore verified state if the user simply refreshed
    if (!wasManuallyDisconnected) {
      const wasVerified =
        sessionStorage.getItem(VELO_SESSION_VERIFIED_KEY) === "true";
      setIsSessionVerified(wasVerified);
    }
  }, [appKitConnected]);

  // ── ECDSA Warning Logic ────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      if (
        typeof window !== "undefined" &&
        (window as any).hashpack_connection_error
      ) {
        toast.error("Connection Error", {
          description:
            "Please ensure your HashPack account is an ECDSA-type account (ED25519 is not supported by WalletConnect).",
          duration: 6000,
        });
        (window as any).hashpack_connection_error = false;
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Account change handler ─────────────────────────────────
  const handleAccountChange = useCallback(
    (newAddress: string | undefined) => {
      if (newAddress && prevAddress && newAddress !== prevAddress) {
        // User switched accounts – clear verified state so they must
        // re-verify, and show a toast.
        setIsSessionVerified(false);
        sessionStorage.removeItem(VELO_SESSION_VERIFIED_KEY);
        toast.info("Account Changed", {
          description: "Please verify your new account session.",
          duration: 4000,
        });
      }
      setPrevAddress(newAddress);
    },
    [prevAddress],
  );

  // ── Verify session handler ─────────────────────────────────
  const verifySession = useCallback(() => {
    setIsSessionVerified(true);
    sessionStorage.setItem(VELO_SESSION_VERIFIED_KEY, "true");
    // Also clear the manual-disconnect flag since the user is
    // actively approving a new session.
    localStorage.removeItem(VELO_MANUAL_DISCONNECT_KEY);
  }, []);

  // ── Full disconnect ────────────────────────────────────────
  const fullDisconnect = useCallback(() => {
    // 1. Call wagmi disconnect
    wagmiDisconnectRef.current?.();

    // 2. Clear WC / AppKit / session storage
    clearWcStorage();

    // 3. Set the manual-disconnect flag so auto-reconnect is
    //    suppressed on the next page load.
    localStorage.setItem(VELO_MANUAL_DISCONNECT_KEY, "true");

    // 4. Reset verified state
    setIsSessionVerified(false);
    sessionStorage.removeItem(VELO_SESSION_VERIFIED_KEY);
    setBalance("0.00");

    toast.success("Disconnected", {
      description: "Wallet session has been cleared.",
      duration: 3000,
    });
  }, []);

  // ── Derived connection state ───────────────────────────────
  // For the rest of the app, "isConnected" means both wallet is
  // linked AND session has been verified by the user.
  const isFullyConnected = !!appKitConnected && isSessionVerified;

  if (!mounted) return null;

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <DisconnectHandler triggerRef={wagmiDisconnectRef} />
        <AccountChangeWatcher onAccountChange={handleAccountChange} />
        <BalanceWatcher
          address={appKitAddress}
          isConnected={!!appKitConnected}
          onBalanceUpdate={setBalance}
        />
        <Web3Context.Provider
          value={{
            isConnected: isFullyConnected,
            isWalletLinked: !!appKitConnected,
            address: appKitAddress || null,
            balance,
            isSessionVerified,
            open,
            disconnect: fullDisconnect,
            verifySession,
          }}
        >
          {children}
          <Toaster theme="dark" position="top-center" richColors closeButton />
        </Web3Context.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// ─────────────────────────────────────────────────────────────────
// Public hook
// ─────────────────────────────────────────────────────────────────
export function useWeb3() {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
}

// ─────────────────────────────────────────────────────────────────
// Helper – purge WalletConnect & wagmi session keys from storage
// ─────────────────────────────────────────────────────────────────
function clearWcStorage() {
  if (typeof window === "undefined") return;

  // Remove known WalletConnect v2 & HashConnect keys
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (
      key.startsWith("wc@2") ||
      key.startsWith("wagmi") ||
      key.startsWith("hashconnect") ||
      key.startsWith("@appkit") ||
      key.startsWith("W3M") ||
      key.startsWith("reown")
    ) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));

  // Also clear sessionStorage WC keys
  const sessionKeysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (!key) continue;
    if (key.startsWith("wc@2") || key.startsWith("wagmi")) {
      sessionKeysToRemove.push(key);
    }
  }
  sessionKeysToRemove.forEach((k) => sessionStorage.removeItem(k));
}
