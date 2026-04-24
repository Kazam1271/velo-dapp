export interface Token {
  symbol: string;
  name: string;
  /** Public icon URL */
  iconUrl: string;
  decimals: number;
  /** Hedera Testnet Token ID – "NATIVE" for HBAR */
  tokenId: string;
  /** Hedera Mainnet Token ID (for price feeds) - null if N/A or Native */
  mainnetId?: string | null;
  /** Community badge shown in dropdown */
  badge?: "trending" | "verified" | "native" | "pilot";
  /** Background colour for icon wrapper (hex / tailwind) */
  iconBg?: string;
}

export const TOKEN_LIST: Token[] = [
  {
    symbol: "HBAR",
    name: "Hedera",
    iconUrl: "https://cryptologos.cc/logos/hedera-hbar-logo.png",
    decimals: 8,
    tokenId: "NATIVE",
    mainnetId: null,
    badge: "verified",
    iconBg: "#000000",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    iconUrl: "https://cryptologos.cc/logos/usd-coin-usdc-logo.png",
    decimals: 6,
    tokenId: "0.0.8735221", // Updated to minted mock USDC
    mainnetId: "0.0.456858",
    badge: "verified",
    iconBg: "#2775ca",
  },
  {
    symbol: "USDT",
    name: "Tether",
    iconUrl: "https://cryptologos.cc/logos/tether-usdt-logo.png",
    decimals: 6,
    tokenId: "0.0.8734118", // Internal Mock USDT
    mainnetId: "0.0.456860",
    badge: "verified",
    iconBg: "#26a17b",
  },
  {
    symbol: "SAUCE",
    name: "SaucerSwap",
    iconUrl: "https://assets.coingecko.com/coins/images/27042/large/sauce.png",
    decimals: 6,
    tokenId: "0.0.8735149", // Updated to new minted mock
    mainnetId: "0.0.731861", // Updated per user table (mainnet)
    badge: "trending",
    iconBg: "#1a1a2e",
  },
  {
    symbol: "BONZO",
    name: "Bonzo Finance",
    iconUrl: "https://assets.coingecko.com/coins/images/35000/large/bonzo.png",
    decimals: 6,
    tokenId: "0.0.8735150", 
    mainnetId: "0.0.4578144", 
    badge: "trending",
    iconBg: "#0d0d1a",
  },
  {
    symbol: "PACK",
    name: "Pack Token",
    iconUrl: "https://assets.coingecko.com/coins/images/37628/large/pack.png",
    decimals: 6,
    tokenId: "0.0.8735151", 
    mainnetId: "0.0.4792777", 
    iconBg: "#16213e",
  },
  {
    symbol: "WHBAR",
    name: "Wrapped HBAR",
    iconUrl: "https://raw.githubusercontent.com/hashgraph/hedera-brand-assets/master/HBAR/hbar-logo-ticker.png",
    decimals: 8,
    tokenId: "0.0.8735222", // Updated to minted mock WHBAR
    mainnetId: "0.0.1456986", // Updated per user table (mainnet)
    badge: "verified",
    iconBg: "#1a1a1a",
  },
  {
    symbol: "VELO",
    name: "Velo",
    iconUrl: "https://i.imgur.com/uF9BXZ8.png",
    decimals: 8,
    tokenId: "0.0.8725045",
    mainnetId: null,
    badge: "native",
    iconBg: "#06b6d4",
  },
];

/** Quick lookup by symbol */
export const TOKEN_MAP: Record<string, Token> = Object.fromEntries(
  TOKEN_LIST.map((t) => [t.symbol, t])
);

// Legacy compat – keep old TOKENS shape for any existing imports
export const TOKENS = {
  HBAR: { symbol: "HBAR", name: "Hedera", icon: TOKEN_MAP.HBAR.iconUrl, decimals: 8 },
  USDC: { symbol: "USDC", name: "USD Coin", icon: TOKEN_MAP.USDC.iconUrl, decimals: 6 },
  SAUCE: { symbol: "SAUCE", name: "SaucerSwap", icon: TOKEN_MAP.SAUCE.iconUrl, decimals: 6 },
};
