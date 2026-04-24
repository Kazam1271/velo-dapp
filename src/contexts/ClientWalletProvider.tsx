'use client';

import dynamic from 'next/dynamic';
import { ReactNode, useEffect, useState } from 'react';

// Dynamically import the actual provider with SSR disabled
const DynamicHashConnectProvider = dynamic(
  () => import('./HashConnectProvider').then((mod) => mod.HashConnectProvider),
  { ssr: false }
);

export function ClientWalletProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <DynamicHashConnectProvider>
      {children}
    </DynamicHashConnectProvider>
  );
}
