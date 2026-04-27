"use client";

import dynamic from "next/dynamic";
import { HCSDataProvider } from "@/contexts/HCSDataProvider";

const SwapInterface = dynamic(() => import("@/components/SwapInterface"), { ssr: false });
const HCSLiveFeed = dynamic(() => import("@/components/HCSLiveFeed"), { ssr: false });

export default function Home() {
  return (
    <HCSDataProvider>
      <div className="flex flex-col gap-12 mt-6">
        <SwapInterface />
        <HCSLiveFeed />
      </div>
    </HCSDataProvider>
  );
}
