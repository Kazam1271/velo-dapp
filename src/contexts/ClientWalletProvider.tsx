'use client';

import dynamic from 'next/dynamic';
import { ReactNode, useEffect, useState } from 'react';

// Dynamically import the actual provider and navigation with SSR disabled
const DynamicHashConnectProvider = dynamic(
  () => import('./HashConnectProvider').then((mod) => mod.HashConnectProvider),
  { ssr: false }
);

const BottomNav = dynamic(() => import('@/components/BottomNav'), { ssr: false });
const Header = dynamic(() => import('@/components/Header'), { ssr: false });

export function ClientWalletProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="min-h-screen bg-velo-bg">{children}</div>;
  }

  return (
    <DynamicHashConnectProvider>
      <div className="flex flex-col min-h-screen bg-velo-bg text-white selection:bg-velo-cyan/30">
        <Header />
        <main className="flex-1 w-full max-w-lg mx-auto px-4 pb-32 pt-6">
          {children}
        </main>
        <BottomNav />
      </div>
    </DynamicHashConnectProvider>
  );
}
