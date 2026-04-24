'use client';
import { HashConnect, HashConnectConnectionState, SessionData } from "hashconnect";
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { AccountId, LedgerId } from "@hiero-ledger/sdk";
import { toast } from "sonner";

const appMetadata = {
    name: "Velo DEX",
    description: "Zero-Slippage OTC Trading Desk",
    icons: ["https://www.hashpack.app/img/logo.svg"], // Must be icons (plural)
    url: "https://velo-swart.vercel.app"
};

const projectId = "77347672d58ccce678cc86eee18c5918";

interface HashConnectContextType {
    hashconnect: HashConnect;
    state: HashConnectConnectionState;
    pairingData: SessionData | null;
    address: string | null;
    hederaAccountId: string | null;
    balance: string;
    isRefreshingBalance: boolean;
    isConnected: boolean;
    connect: () => void;
    disconnect: () => void;
}

const HashConnectContext = createContext<HashConnectContextType | null>(null);

export const HashConnectProvider = ({ children }: { children: ReactNode }) => {
    const [hashconnect] = useState(() => {
        if (typeof window !== 'undefined') {
            console.log("[HashConnect] Creating instance with Ledger: testnet, ProjectID:", projectId);
            return new HashConnect(LedgerId.TESTNET, projectId, appMetadata, true);
        }
        return null as any;
    });

    const [state, setState] = useState(HashConnectConnectionState.Disconnected);
    const [pairingData, setPairingData] = useState<SessionData | null>(null);
    const [balance, setBalance] = useState("0.00");
    const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);

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
            try {
                // Set up event listeners BEFORE calling init()
                hashconnect.connectionStatusChangeEvent.on((status: HashConnectConnectionState) => {
                    console.log("[HashConnect] Connection status changed:", status);
                    setState(status);
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

                await hashconnect.init();
                console.log("[HashConnect] Initialization complete");
            } catch (error) {
                console.error("[HashConnect] Init error:", error);
            }
        };

        init();
        
        return () => {
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
        if (!hashconnect) return;
        try {
            // Correct v3 API: triggers the universal pairing modal
            hashconnect.openPairingModal();
        } catch (error: any) {
            toast.error("Connection Failed", { description: error.message });
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
            connect,
            disconnect 
        }}>
            {children}
        </HashConnectContext.Provider>
    );
};

export const useHashConnect = () => {
    const context = useContext(HashConnectContext);
    if (!context) throw new Error("useHashConnect must be used within HashConnectProvider");
    return context;
};
