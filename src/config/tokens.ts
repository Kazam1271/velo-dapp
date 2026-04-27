export interface Token {
  symbol: string;
  name: string;
  logoURI: string;
  decimals: number;
  tokenId: string;
  mainnetId?: string;
  badge?: string;
  iconBg?: string;
}

export const TOKEN_LIST: Token[] = [
  {
    symbol: "HBAR",
    name: "Hedera",
    logoURI: "/hbar.png",
    decimals: 8,
    tokenId: "NATIVE",
    iconBg: "#1a1a1a",
  },
  {
    symbol: "VELO",
    name: "Velo",
    logoURI: "/logov.png",
    decimals: 8,
    tokenId: "0.0.8725045",
    mainnetId: "0.0.0", // TBD
    badge: "new",
    iconBg: "#06b6d4",
  },
  {
    symbol: "SAUCE",
    name: "SaucerSwap",
    logoURI: "https://raw.githubusercontent.com/saucerswaplabs/assets/master/tokens/sauce.svg",
    decimals: 6,
    tokenId: "0.0.8735149",
    mainnetId: "0.0.731861",
    iconBg: "#14142b",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    logoURI: "https://raw.githubusercontent.com/saucerswaplabs/assets/master/tokens/usdc.png",
    decimals: 6,
    tokenId: "0.0.8735221",
    mainnetId: "0.0.456858",
    iconBg: "#2775ca",
  },
  {
    symbol: "USDT",
    name: "Tether",
    logoURI: "https://assets.coingecko.com/coins/images/325/large/Tether.png",
    decimals: 6,
    tokenId: "0.0.8734118",
    mainnetId: "0.0.512345", // Mock
    iconBg: "#26a17b",
  },
  {
    symbol: "BONZO",
    name: "Bonzo Finance",
    logoURI: "/bonzo.png",
    decimals: 6,
    tokenId: "0.0.8735150",
    mainnetId: "0.0.4578144",
    badge: "trending",
    iconBg: "#0d0d1a",
  },
  {
    symbol: "PACK",
    name: "HashPack Token",
    logoURI: "https://raw.githubusercontent.com/saucerswaplabs/assets/master/tokens/pack.png",
    decimals: 6,
    tokenId: "0.0.8735151",
    mainnetId: "0.0.4792777",
    iconBg: "#16213e",
  },
  {
    symbol: "WHBAR",
    name: "Wrapped HBAR",
    logoURI: "https://raw.githubusercontent.com/saucerswaplabs/assets/master/tokens/hbar.png",
    decimals: 8,
    tokenId: "0.0.8735222",
    mainnetId: "0.0.1456986",
    iconBg: "#1a1a1a",
  }
];

export const getTokenById = (id: string) => TOKEN_LIST.find(t => t.tokenId === id);
export const getTokenBySymbol = (symbol: string) => TOKEN_LIST.find(t => t.symbol === symbol);
