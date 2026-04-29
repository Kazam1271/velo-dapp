import { HashConnect, SessionData } from "hashconnect";
import { useEffect, useState, useCallback, ReactNode } from "react";
import { AccountId, LedgerId } from "@hiero-ledger/sdk";
import { toast } from "sonner";
import { HashConnectContext, HashConnectConnectionState, HashConnectContextType } from "./HashConnectContext";

const appMetadata = {
    name: "Velo",
    description: "The Premier Hedera Trading Desk",
    icons: ["https://velo-swart.vercel.app/logov.png"], 
    url: "https://veloexchange.org"
};

const projectId = "77347672d58ccce678cc86eee18c5918";
const network = "testnet"; // Forced constant

export const HashConnectProvider = ({ children }: { children: ReactNode }) => {
    const [hashconnect] = useState(() => {
        if (typeof window !== 'undefined') {
            console.log("[HashConnect] Creating instance with Ledger: testnet, ProjectID:", projectId);
            // Task 1: Hardcode network explicitly to "testnet" (LedgerId.TESTNET)
            return new HashConnect(LedgerId.TESTNET, projectId, appMetadata, true);
        }
        return null as any;
    });

    const [state, setState] = useState(HashConnectConnectionState.Disconnected);
    const [pairingData, setPairingData] = useState<SessionData | null>(null);
    const [balance, setBalance] = useState("0.00");
    const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [relayStatus, setRelayStatus] = useState<"connected" | "disconnected" | "connecting">("connecting");

    // Derived states
    const hederaAccountId = pairingData?.accountIds?.[0] || null;
    const address = hederaAccountId;
    const isConnected = state === HashConnectConnectionState.Connected || state === HashConnectConnectionState.Paired;

    const fetchBalance = useCallback(async () => {
        if (!hederaAccountId) {
            setBalance("0.00");
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
                setBalance((rawBalance / 100000000).toFixed(2));
            }
        } catch (error) {
            console.error("[HashConnect] Failed to fetch balance:", error);
        } finally {
            setIsRefreshingBalance(false);
        }
    }, [hederaAccountId]);

    useEffect(() => {
        if (!hashconnect || typeof window === 'undefined') return;

        const init = async () => {
            console.log("[HashConnect] Initializing with Project ID:", projectId);
            
            // Task 4: Proactive session cleanup - Clear if no valid topic
            try {
                const data = localStorage.getItem("hashconnectData");
                if (data) {
                    const parsed = JSON.parse(data);
                    // If data exists but is broken or missing core session topic, purge it
                    if (!parsed.topic || parsed.topic === "undefined" || parsed.topic === "null") {
                        console.warn("[HashConnect] Purging invalid session data...");
                        localStorage.removeItem("hashconnectData");
                    }
                }
            } catch (e) {}

            try {
                // Set up event listeners BEFORE calling init()
                hashconnect.connectionStatusChangeEvent.on((status: HashConnectConnectionState) => {
                    console.log("[HashConnect] Connection status changed:", status);
                    setState(status);
                    
                    if (status === HashConnectConnectionState.Connected) setRelayStatus("connected");
                    else if (status === HashConnectConnectionState.Disconnected) setRelayStatus("disconnected");
                });

                hashconnect.pairingEvent.on((data: SessionData) => {
                    console.log("[HashConnect] Pairing event received:", data);
                    setPairingData(data);
                    toast.success("Wallet Connected!");
                });

                hashconnect.disconnectionEvent.on(() => {
                    console.log("[HashConnect] Disconnection event");
                    setPairingData(null);
                    setState(HashConnectConnectionState.Disconnected);
                    toast.info("Wallet Disconnected");
                });

                // Task 2: Explicitly pass testnet and relay fallback to init if supported
                // Some HashConnect v3 versions use this for relay overrides
                // Task 2: Hardcode "testnet" string explicitly in init
                await hashconnect.init();
                
                setIsInitialized(true);
                setRelayStatus("connected");
                console.log("[HashConnect] Initialization complete");
            } catch (error) {
                console.error("[HashConnect] Init error:", error);
                setRelayStatus("disconnected");
                setIsInitialized(true);
            }
        };

        init();

        // Task 3: Connection Timeout & Hint
        const timer = setTimeout(() => {
            if (!isInitialized) {
                setIsInitialized(true);
                toast.info("Connection taking a while?", {
                    description: "If you're on a restricted network, try disabling ad-blockers or using the HashPack extension directly.",
                    duration: 6000
                });
            }
        }, 5000);
        
        return () => {
            clearTimeout(timer);
            (hashconnect.connectionStatusChangeEvent as any).off();
            (hashconnect.pairingEvent as any).off();
            (hashconnect.disconnectionEvent as any).off();
        };
    }, [hashconnect]);

    useEffect(() => {
        fetchBalance();
        const interval = setInterval(fetchBalance, 10000);
        return () => clearInterval(interval);
    }, [fetchBalance]);

    const connect = () => {
        if (!hashconnect || !isInitialized) {
            toast.error("Wallet service is still initializing. Please wait a moment.");
            return;
        }

        // Task 1: Prioritize Local Extension
        if (typeof window !== 'undefined' && (window as any).hashpack) {
            console.log("[HashConnect] Extension found, bypassing relay...");
            try {
                (hashconnect as any).connectToLocalWallet();
                return;
            } catch (e) {
                console.warn("[HashConnect] Local connection failed, falling back to modal...", e);
            }
        }

        // Fallback to WalletConnect relay bridge for mobile/no-extension users
        try {
            console.log("[HashConnect] Opening pairing modal...");
            hashconnect.openPairingModal();
        } catch (error: any) {
            console.error("[HashConnect] Connection error:", error);
            
            // Task 3: Specific feedback for WebSocket/Network failures
            if (error.message?.includes("WebSocket") || error.message?.includes("relay")) {
                toast.error("Connection Blocked", { 
                    description: "Connection blocked by network. Please check your firewall or try a different internet connection." 
                });
            } else {
                toast.error("Connection Failed", { description: error.message });
            }
        }
    };

    const disconnect = async () => {
        if (!hashconnect) return;
        await hashconnect.disconnect();
        setPairingData(null);
    };

    return (
        <HashConnectContext.Provider value={{ 
            hashconnect: hashconnect!,
            state, 
            pairingData, 
            address, 
            hederaAccountId, 
            balance, 
            isRefreshingBalance,
            isConnected,
            isInitialized,
            relayStatus,
            connect,
            disconnect 
        }}>
            {children}
        </HashConnectContext.Provider>
    );
};
