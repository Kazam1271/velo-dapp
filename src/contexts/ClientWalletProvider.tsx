'use client';

import dynamic from 'next/dynamic';
import { ReactNode, useEffect, useState } from 'react';

// Dynamically import the actual provider and navigation with SSR disabled
const AppKitProvider = dynamic(
  () => import('./AppKitProvider'),
  { ssr: false }
);

// Native HashPack pairing (supports ED25519 accounts, which can't sign via
// the EVM/wagmi path). Used by the Earn page's native staking flow.
const HashConnectProvider = dynamic(
  () => import('./HashConnectProvider').then((m) => m.HashConnectProvider),
  { ssr: false }
);

const BottomNav = dynamic(() => import('@/components/BottomNav'), { ssr: false });
const Header = dynamic(() => import('@/components/Header'), { ssr: false });
import { usePathname } from 'next/navigation';

import { State } from 'wagmi';

export function ClientWalletProvider({ 
  children,
  initialState
}: { 
  children: ReactNode;
  initialState?: State;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const pathname = usePathname();
  const isLandingPage = pathname === '/';

  if (!mounted) {
    return <div className="min-h-screen bg-velo-bg">{children}</div>;
  }

  return (
    <AppKitProvider initialState={initialState}>
      <HashConnectProvider>
        <div className="flex flex-col min-h-screen bg-velo-bg text-white selection:bg-velo-cyan/30">
          {!isLandingPage && <Header />}

          {isLandingPage ? (
            <main className="flex-1 w-full">
              {children}
            </main>
          ) : (
            <main className="flex-1 w-full max-w-lg mx-auto px-4 pb-32 pt-6">
              {children}
            </main>
          )}

          {!isLandingPage && <BottomNav />}
        </div>
      </HashConnectProvider>
    </AppKitProvider>
  );
}
