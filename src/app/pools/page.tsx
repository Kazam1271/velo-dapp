"use client";

import dynamic from "next/dynamic";
import { HCSDataProvider } from "@/contexts/HCSDataProvider";

const EarnInterface = dynamic(() => import("@/components/EarnInterface"), { ssr: false });

export default function PoolsPage() {
  return (
    <HCSDataProvider>
      <EarnInterface />
    </HCSDataProvider>
  );
}
