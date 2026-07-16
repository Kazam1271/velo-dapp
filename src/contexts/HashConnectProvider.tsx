import { HashConnect, SessionData } from "hashconnect";
import { useEffect, useState, useCallback, useRef, ReactNode } from "react";
// Must come from @hashgraph/sdk (hashconnect's own SDK), not @hiero-ledger/sdk.
import { LedgerId } from "@hashgraph/sdk";
import { toast } from "sonner";
import { HashConnectContext, HashConnectConnectionState, HashConnectContextType } from "./HashConnectContext";

const appMetadata = {
    name: "Velo",
    description: "Frictionless DeFi on Hedera",
    icons: ["https://veloexchange.org/logov.png"], 
    url: "https://veloexchange.org"
};

const projectId = "77347672d58ccce678cc86eee18c5918";

export const HashConnectProvider = ({ children }: { children: ReactNode }) => {
    const [hashconnect] = useState(() => {
        if (typeof window !== 'undefined') {
            console.log("[HashConnect] Creating instance with Ledger: mainnet, ProjectID:", projectId);
            return new HashConnect(LedgerId.MAINNET, projectId, appMetadata, true);
        }
        return null as any;
    });

    const [state, setState] = useState(HashConnectConnectionState.Disconnected);
    const [pairingData, setPairingData] = useState<SessionData | null>(null);
    const [balance, setBalance] = useState("0.00");
    const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    // Mirrors isInitialized for the init-timeout check (state would be a stale
    // closure inside the setTimeout below).
    const initializedRef = useRef(false);
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
                `https://mainnet-public.mirrornode.hedera.com/api/v1/accounts/${hederaAccountId}`
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

    // Run init exactly once per HashConnect instance. React StrictMode mounts
    // effects twice in dev; a second init() re-wires hashconnect's internal
    // emitters and orphans our pairing listeners (pairing then only shows up
    // after a reload).
    const initOnceRef = useRef(false);

    useEffect(() => {
        if (!hashconnect || typeof window === 'undefined' || initOnceRef.current) return;
        initOnceRef.current = true;

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

                initializedRef.current = true;
                setIsInitialized(true);
                setRelayStatus("connected");
                console.log("[HashConnect] Initialization complete");
            } catch (error) {
                console.error("[HashConnect] Init error:", error);
                setRelayStatus("disconnected");
                initializedRef.current = true;
                setIsInitialized(true);
            }
        };

        init();

        // Init-timeout hint — only if init genuinely hasn't finished.
        const timer = setTimeout(() => {
            if (!initializedRef.current) {
                initializedRef.current = true;
                setIsInitialized(true);
                toast.info("Connection taking a while?", {
                    description: "If you're on a restricted network, try disabling ad-blockers or using the HashPack extension directly.",
                    duration: 6000
                });
            }
        }, 5000);
        
        // Deliberately keep the listeners attached — the instance is an
        // app-lifetime singleton, and detaching here breaks live pairing
        // updates under StrictMode's double-mount.
        return () => {
            clearTimeout(timer);
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

        // HashConnect v3's pairing modal handles both the browser extension
        // and mobile (WalletConnect relay) flows.
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
