import nextDynamic from "next/dynamic";

const TransferView = nextDynamic(() => import("@/components/TransferView"), { ssr: false });

export default function TransferPage() {
  return <TransferView />;
}
