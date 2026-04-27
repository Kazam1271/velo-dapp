import type { Metadata } from "next";
import "./globals.css";
import { ClientWalletProvider } from "@/contexts/ClientWalletProvider";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: 'Velo | Hedera DEX',
  description: 'Zero-slippage trading on the Hedera network.',
  icons: {
    icon: '/logov.png',
    apple: '/logov.png',
  },
  openGraph: {
    title: 'Velo DEX',
    description: 'Zero-slippage trading on the Hedera network.',
    images: ['/logo.png'], // Use the full logo for large social previews
  }
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
        <ClientWalletProvider>
          {children}
          <Toaster position="bottom-right" theme="dark" />
        </ClientWalletProvider>
      </body>
    </html>
  );
}
