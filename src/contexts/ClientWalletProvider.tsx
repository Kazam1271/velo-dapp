'use client';

import dynamic from 'next/dynamic';
import { ReactNode, useEffect, useState } from 'react';

// Dynamically import the actual provider and navigation with SSR disabled
const DynamicHashConnectProvider = dynamic(
  () => import('./HashConnectProvider').then((mod) => mod.HashConnectProvider),
  { ssr: false }
);

const BottomNav = dynamic(() => import('@/components/BottomNav'), { ssr: false });

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
      {children}
      <BottomNav />
    </DynamicHashConnectProvider>
  );
}
