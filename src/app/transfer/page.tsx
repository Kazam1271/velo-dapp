"use client";

import nextDynamic from "next/dynamic";

const TransferView = nextDynamic(() => import("@/components/TransferView"), { 
  ssr: false,
  loading: () => <div className="min-h-screen bg-velo-bg" />
});

export default function TransferPage() {
  return <TransferView />;
}
