"use client";

import nextDynamic from "next/dynamic";
import { Suspense } from "react";

const VerifyDiscord = nextDynamic(() => import("@/components/VerifyDiscord"), {
  ssr: false,
  loading: () => <div className="min-h-screen bg-velo-bg" />,
});

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-velo-bg" />}>
      <VerifyDiscord />
    </Suspense>
  );
}
