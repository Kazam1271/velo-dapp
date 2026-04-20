import Header from "@/components/Header";
import SwapInterface from "@/components/SwapInterface";
import HCSLiveFeed from "@/components/HCSLiveFeed";
import BottomNav from "@/components/BottomNav";
import { HCSDataProvider } from "@/contexts/HCSDataProvider";

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

          <BottomNav />
        </main>
      </div>
    </HCSDataProvider>
  );
}
