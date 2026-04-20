"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
// Integrating the Hedera SDK - for now we mock the live testnet feed 
// but setup the client boilerplate for immediate transition.
import { Client } from "@hashgraph/sdk";

export interface FeedItem {
  id: string;
  timeAgo: string;
  action: string;
  amount1: string;
  token1: string;
  preps: string;
  amount2: string;
  token2: string;
}

interface HCSDataContextType {
  feed: FeedItem[];
}

const HCSDataContext = createContext<HCSDataContextType | undefined>(undefined);

const mockDataPool: Omit<FeedItem, "id" | "timeAgo">[] = [
  { action: "swapped", amount1: "2,000", token1: "USDC", preps: "for", amount2: "", token2: "SAUCE" },
  { action: "removed liquidity", amount1: "", token1: "", preps: "", amount2: "5,000", token2: "HBAR" },
  { action: "added liquidity", amount1: "1,500", token1: "USDC", preps: "to", amount2: "", token2: "Pool" },
  { action: "swapped", amount1: "500", token1: "HBAR", preps: "for", amount2: "150", token2: "USDC" },
];

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
        const newFeed = [
          {
            ...randomItem,
            id: Date.now().toString(),
            timeAgo: "1s ago",
          },
          ...prev.map(item => ({...item, timeAgo: "1s ago"})),
        ].slice(0, 5); // keep latest 5
        return newFeed;
      });
    }, 4500);

    // Initial load
    setFeed([{
      ...mockDataPool[0],
      id: Date.now().toString(),
      timeAgo: "1s ago"
    }]);

    return () => clearInterval(interval);
  }, []);

  return (
    <HCSDataContext.Provider value={{ feed }}>
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
