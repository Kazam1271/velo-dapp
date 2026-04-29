'use client';
import { createContext, useContext } from "react";

export enum HashConnectConnectionState {
    Connected = "Connected",
    Disconnected = "Disconnected",
    Paired = "Paired",
    Connecting = "Connecting"
}

export interface HashConnectContextType {
    hashconnect: any;
    state: HashConnectConnectionState;
    pairingData: any | null;
    address: string | null;
    hederaAccountId: string | null;
    balance: string;
    isRefreshingBalance: boolean;
    isConnected: boolean;
    isInitialized: boolean;
    relayStatus: "connected" | "disconnected" | "connecting";
    connect: () => void;
    disconnect: () => void;
}

export const HashConnectContext = createContext<HashConnectContextType | null>(null);

export const useHashConnect = () => {
    const context = useContext(HashConnectContext);
    return context;
};
