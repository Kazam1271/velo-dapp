"use client";

import dynamic from "next/dynamic";
import { HCSDataProvider } from "@/contexts/HCSDataProvider";

const Header = dynamic(() => import("@/components/Header"), { ssr: false });
const SwapInterface = dynamic(() => import("@/components/SwapInterface"), { ssr: false });
const HCSLiveFeed = dynamic(() => import("@/components/HCSLiveFeed"), { ssr: false });

export default function Home() {
  return (
    <HCSDataProvider>
      <div className="min-h-screen bg-velo-bg text-white relative flex justify-center selection:bg-velo-cyan/30">
        <main className="w-full max-w-lg min-h-screen flex flex-col mx-auto px-4 box-border pb-24">
          <Header />
          
          <div className="flex-1 flex flex-col justify-center gap-12 mt-6">
            <SwapInterface />
            <HCSLiveFeed />
          </div>
        </main>
      </div>
    </HCSDataProvider>
  );
}
