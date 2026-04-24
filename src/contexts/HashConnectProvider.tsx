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

// Initialize HashConnect v3 correctly
const hashconnect = new HashConnect(LedgerId.TESTNET, projectId, appMetadata, false);

interface HashConnectContextType {
    hashconnect: HashConnect;
    state: HashConnectConnectionState;
    pairingData: SessionData | null;
    address: string | null;
    hederaAccountId: string | null;
    balance: string;
    isRefreshingBalance: boolean;
    connect: () => void;
    disconnect: () => void;
}

const HashConnectContext = createContext<HashConnectContextType | null>(null);

export const HashConnectProvider = ({ children }: { children: ReactNode }) => {
    const [state, setState] = useState(HashConnectConnectionState.Disconnected);
    const [pairingData, setPairingData] = useState<SessionData | null>(null);
    const [balance, setBalance] = useState("0.00");
    const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);

    // Derived states
    const hederaAccountId = pairingData?.accountIds?.[0] || null;
    const address = hederaAccountId; // Use account ID as the address in native mode

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
        const init = async () => {
            await hashconnect.init();
            
            hashconnect.connectionStatusChangeEvent.on((status) => {
                setState(status);
            });

            hashconnect.pairingEvent.on((data) => {
                setPairingData(data);
                toast.success("Wallet Connected!");
            });

            hashconnect.disconnectionEvent.on(() => {
                setPairingData(null);
                setState(HashConnectConnectionState.Disconnected);
                toast.info("Wallet Disconnected");
            });
        };

        init();
        
        return () => {
            hashconnect.connectionStatusChangeEvent.off();
            hashconnect.pairingEvent.off();
            hashconnect.disconnectionEvent.off();
        };
    }, []);

    useEffect(() => {
        fetchBalance();
        const interval = setInterval(fetchBalance, 10000);
        return () => clearInterval(interval);
    }, [fetchBalance]);

    const connect = () => {
        try {
            hashconnect.connectToLocalWallet();
        } catch (error: any) {
            toast.error("Connection Failed", { description: error.message });
        }
    };

    const disconnect = async () => {
        if (pairingData?.topic) {
            await hashconnect.disconnect(pairingData.topic);
            setPairingData(null);
        }
    };

    return (
        <HashConnectContext.Provider value={{ 
            hashconnect, 
            state, 
            pairingData, 
            address, 
            hederaAccountId, 
            balance, 
            isRefreshingBalance,
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

// Fallback useWeb3 to avoid breaking components during migration
export const useWeb3 = () => {
    const hc = useHashConnect();
    return {
        ...hc,
        isConnected: hc.state === HashConnectConnectionState.Connected,
        open: hc.connect,
    };
};
