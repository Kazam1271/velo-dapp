'use client';

import { createAppKit } from '@reown/appkit/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, type State } from 'wagmi';
import { wagmiAdapter, projectId, networks } from '@/config/appkit';
import React, { type ReactNode } from 'react';

const queryClient = new QueryClient();

// Initialize AppKit (called once, outside the component)
createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  metadata: {
    name: 'Velo',
    description: 'Frictionless DeFi on Hedera',
    url: 'https://veloexchange.org',
    icons: ['https://veloexchange.org/logov.png'],
  },
  features: {
    analytics: true,
  },
});

export default function AppKitProvider({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState?: State;
}) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
