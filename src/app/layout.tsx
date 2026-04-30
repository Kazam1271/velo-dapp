import type { Metadata } from "next";
import "./globals.css";

// Polyfill Buffer for HashConnect/WalletConnect compatibility
if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || require('buffer').Buffer;
}
import { ClientWalletProvider } from "@/contexts/ClientWalletProvider";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: 'Velo | Hedera DEX',
  description: 'Frictionless DeFi on Hedera.',
  icons: {
    icon: '/logov.png',
    shortcut: '/logov.png',
    apple: '/logov.png',
  },
  openGraph: {
    title: 'Velo | Hedera DEX',
    description: 'Frictionless DeFi on Hedera.',
    url: 'https://veloexchange.org',
    siteName: 'Velo',
    images: [
      {
        url: 'https://veloexchange.org/logov.png',
        width: 512,
        height: 512,
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Velo | Hedera DEX',
    description: 'Frictionless DeFi on Hedera.',
    images: ['https://veloexchange.org/logov.png'],
  },
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
