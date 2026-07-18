import type { Metadata } from "next";
import "./globals.css";


import { ClientWalletProvider } from "@/contexts/ClientWalletProvider";
import { Toaster } from "sonner";
import { SpeedInsights } from "@vercel/speed-insights/next";

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

import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import { config } from "@/config/appkit";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const cookies = headersList.get('cookie');
  const initialState = cookieToInitialState(config, cookies);

  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col font-sans">
        <ClientWalletProvider initialState={initialState}>
          {children}
          <Toaster position="bottom-right" theme="dark" />
        </ClientWalletProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
