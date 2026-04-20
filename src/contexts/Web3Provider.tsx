"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { ethers } from "ethers";

interface Web3ContextType {
  isConnected: boolean;
  address: string | null;
  balance: string;
  isModalOpen: boolean;
  setModalOpen: (open: boolean) => void;
  connectMetaMask: () => Promise<void>;
  connectHashPack: () => Promise<void>;
  connectGoogle: () => Promise<void>;
  disconnect: () => void;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState("0.00");
  const [isModalOpen, setModalOpen] = useState(false);

  // Expose toaster globally for components to use
  useEffect(() => {
    (window as any).veloToast = (message: string, type: 'error' | 'success' = 'error') => {
      const event = new CustomEvent('velo-toast', { detail: { message, type } });
      window.dispatchEvent(event);
    };
  }, []);

  const connectMetaMask = async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const network = await provider.getNetwork();
        
        // 296 is Hedera Testnet
        if (network.chainId !== 296n) {
          (window as any).veloToast?.("Wrong Network: Please switch to Hedera Testnet to use the Velo Pilot.", "error");
          // Attempt to switch (optional)
        }

        const accounts = await provider.send("eth_requestAccounts", []);
        if (accounts.length > 0) {
          setAddress(accounts[0]);
          setIsConnected(true);
          setModalOpen(false);
          
          // Fetch balance
          const bal = await provider.getBalance(accounts[0]);
          setBalance(ethers.formatEther(bal));
        }
      } catch (err: any) {
        if (err.code === 4001) {
          (window as any).veloToast?.("Connection Cancelled: Please allow the request.", "error");
        } else {
          console.error(err);
        }
      }
    } else {
      (window as any).veloToast?.("No Wallet Detected: Install MetaMask to get started.", "error");
    }
  };

  const connectHashPack = async () => {
    // Simulated HashPack flow to bypass library issues
    try {
      (window as any).veloToast?.("Connecting to HashPack...", "success");
      setTimeout(() => {
        setAddress("0.0.123456");
        setBalance("1500.50");
        setIsConnected(true);
        setModalOpen(false);
      }, 1000);
    } catch (err) {
      console.error(err);
    }
  };

  const connectGoogle = async () => {
    // Simulated Google embedded wallet flow
    try {
      (window as any).veloToast?.("Authenticating with Google...", "success");
      setTimeout(() => {
        setAddress("0xGoogleEmbeddedUser");
        setBalance("500.00");
        setIsConnected(true);
        setModalOpen(false);
      }, 1500);
    } catch (err) {
      console.error(err);
    }
  };

  const disconnect = () => {
    setIsConnected(false);
    setAddress(null);
    setBalance("0.00");
  };

  return (
    <Web3Context.Provider value={{
      isConnected,
      address,
      balance,
      isModalOpen,
      setModalOpen,
      connectMetaMask,
      connectHashPack,
      connectGoogle,
      disconnect
    }}>
      {children}
      <CustomToaster />
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
}

/**
 * Native Toast Implementation
 */
function CustomToaster() {
  const [toasts, setToasts] = useState<{id: number, message: string, type: 'error' | 'success'}[]>([]);

  useEffect(() => {
    const handleToast = (e: any) => {
      const id = Date.now();
      setToasts(prev => [...prev, {id, message: e.detail.message, type: e.detail.type}]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 5000);
    };

    window.addEventListener('velo-toast', handleToast);
    return () => window.removeEventListener('velo-toast', handleToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-[320px] px-4 pointer-events-none transition-all">
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto bg-[#0b0e14] border border-velo-cyan/50 rounded-xl p-4 shadow-2xl animate-in slide-in-from-bottom-4 flex items-center justify-center text-center">
          <p className="text-xs font-medium text-white tracking-tight">{toast.message}</p>
        </div>
      ))}
    </div>
  );
}
