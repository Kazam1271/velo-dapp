import type { Metadata } from "next";
import "./globals.css";
import { Web3Provider } from "@/contexts/Web3Provider";
import ConnectModal from "@/components/ConnectModal";

export const metadata: Metadata = {
  title: "Velo",
  description: "High-velocity Hedera DeFi dApp",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col font-sans">
        <Web3Provider>
          {children}
          <ConnectModal />
        </Web3Provider>
      </body>
    </html>
  );
}
