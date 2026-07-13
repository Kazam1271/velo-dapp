import { cookieStorage, createStorage } from '@wagmi/core';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { defineChain } from '@reown/appkit/networks';
import type { AppKitNetwork } from '@reown/appkit/networks';

const envProjectId = process.env.NEXT_PUBLIC_PROJECT_ID;
if (!envProjectId) throw new Error('Project ID is not defined');
// Narrowed to `string` so downstream consumers (createAppKit) don't see `undefined`.
export const projectId = envProjectId;

// Define Hedera Mainnet as a custom chain
export const hederaMainnet = defineChain({
  id: 295,
  caipNetworkId: 'eip155:295',
  chainNamespace: 'eip155',
  name: 'Hedera Mainnet',
  nativeCurrency: {
    decimals: 18, // EVM standard for gas token
    name: 'HBAR',
    symbol: 'HBAR',
  },
  rpcUrls: {
    default: { http: ['https://mainnet.hashio.io/api'] },
  },
  blockExplorers: {
    default: { name: 'HashScan', url: 'https://hashscan.io/mainnet' },
  },
});

// Non-empty tuple type is required by createAppKit; avoid `as const` (readonly) which
// isn't assignable to AppKit's mutable network arrays.
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [hederaMainnet];

// Set up the Wagmi Adapter with SSR support
export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({
    storage: cookieStorage,
  }),
  ssr: true,
  projectId,
  networks,
});

export const config = wagmiAdapter.wagmiConfig;
