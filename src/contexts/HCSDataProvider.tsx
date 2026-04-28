"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
// Integrating the Hedera SDK - for now we mock the live testnet feed 
// but setup the client boilerplate for immediate transition.
import { Client } from "@hiero-ledger/sdk";

export interface FeedItem {
  id: string;
  timestamp: number; // For relative time calculation
  action: string;
  amount1: string;
  token1: string;
  preps: string;
  amount2: string;
  token2: string;
  txHash: string;
  account: string;
}

interface HCSDataContextType {
  feed: FeedItem[];
  pushAction: (action: string, token: string, amount: string) => void;
}

const HCSDataContext = createContext<HCSDataContextType | undefined>(undefined);

const mockDataPool: Omit<FeedItem, "id" | "timestamp" | "txHash" | "account">[] = [
  { action: "swapped", amount1: "2,000.00", token1: "USDC", preps: "for", amount2: "", token2: "SAUCE" },
  { action: "swapped", amount1: "500.00", token1: "HBAR", preps: "for", amount2: "150.00", token2: "USDC" },
  { action: "swapped", amount1: "1,200.00", token1: "SAUCE", preps: "for", amount2: "50.00", token2: "HBAR" },
  { action: "swapped", amount1: "10,000.00", token1: "PACK", preps: "for", amount2: "85.00", token2: "USDC" },
  { action: "swapped", amount1: "250.00", token1: "USDT", preps: "for", amount2: "1,000.00", token2: "BONZO" },
];

function generateTxHash() {
  return Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

function generateAccount() {
  return `0.0.${Math.floor(Math.random() * 90000) + 10000}`;
}

export function HCSDataProvider({ children }: { children: React.ReactNode }) {
  const [feed, setFeed] = useState<FeedItem[]>([]);

  useEffect(() => {
    // Boilerplate for Hedera Testnet connection
    let client: Client;
    try {
      client = Client.forTestnet();
      // In a real scenario, we would subscribe to a topic here:
      // new TopicMessageQuery().setTopicId("0.0.xxxxx").subscribe(client, ...);
    } catch (e) {
      console.warn("Hedera client init skipped for mock");
    }

    // Mock data interval to simulate HCS live feed terminal
    const interval = setInterval(() => {
      const randomItem = mockDataPool[Math.floor(Math.random() * mockDataPool.length)];
      
      setFeed((prev) => {
        const newItem: FeedItem = {
          ...randomItem,
          id: `${Date.now()}-${Math.random()}`,
          timestamp: Date.now(),
          txHash: generateTxHash(),
          account: generateAccount(),
        };
        return [newItem, ...prev].slice(0, 10); // keep latest 10
      });
    }, 3800);

    // Initial load
    setFeed([{
      ...mockDataPool[0],
      id: Date.now().toString(),
      timestamp: Date.now(),
      txHash: generateTxHash(),
      account: generateAccount(),
    }]);

    return () => clearInterval(interval);
  }, []);

  const pushAction = (action: string, token: string, amount: string) => {
    setFeed((prev) => {
      const newItem: FeedItem = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: Date.now(),
        action,
        amount1: amount,
        token1: token,
        preps: "to",
        amount2: "",
        token2: "Treasury",
        txHash: generateTxHash(),
        account: "0.0.You",
      };
      return [newItem, ...prev].slice(0, 10);
    });
  };

  return (
    <HCSDataContext.Provider value={{ feed, pushAction }}>
      {children}
    </HCSDataContext.Provider>
  );
}

export function useHCSData() {
  const context = useContext(HCSDataContext);
  if (context === undefined) {
    throw new Error("useHCSData must be used within an HCSDataProvider");
  }
  return context;
}
