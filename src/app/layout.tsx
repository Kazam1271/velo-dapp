import type { Metadata } from "next";
import "./globals.css";
import { HashConnectProvider } from "@/contexts/HashConnectProvider";
import { Toaster } from "sonner";

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
        <HashConnectProvider>
          {children}
          <Toaster position="bottom-right" theme="dark" />
        </HashConnectProvider>
      </body>
    </html>
  );
}
