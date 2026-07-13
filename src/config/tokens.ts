export interface Token {
  symbol: string;
  name: string;
  logoURI: string;
  decimals: number;
  tokenId: string;
  evmAddress?: string;
  isActive: boolean;
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
    isActive: true,
    iconBg: "#1a1a1a",
  },
  {
    symbol: "WHBAR",
    name: "Wrapped HBAR",
    logoURI: "/hbar.png",
    decimals: 8,
    tokenId: "0.0.1456986",
    evmAddress: "0x0000000000000000000000000000000000163b5a",
    isActive: true,
    iconBg: "#1a1a1a",
  },
  {
    // SAUCE has a confirmed V2 pool with WHBAR at fee 3000
    symbol: "SAUCE",
    name: "SaucerSwap",
    logoURI: "/sauce.png",
    decimals: 6,
    tokenId: "0.0.731861",
    evmAddress: "0x00000000000000000000000000000000000b2ad5",
    isActive: true,
    iconBg: "#000000",
  },
  {
    // xSAUCE (staked SAUCE), token id 0.0.1460200, 6 decimals.
    // NOTE: this slot previously mislabeled it as "HBARX" with 8 decimals — corrected.
    // Pools mainly with SAUCE; HBAR routing depends on a live WHBAR pool.
    symbol: "xSAUCE",
    name: "Staked SAUCE",
    logoURI: "/sauce.png",
    decimals: 6,
    tokenId: "0.0.1460200",
    evmAddress: "0x00000000000000000000000000000000001647e8",
    isActive: true,
    iconBg: "#000000",
  },
  {
    // USD Coin (native Circle USDC on Hedera). 6 decimals.
    // Swappable if a SaucerSwap V2 WHBAR/USDC pool is live (the quoter tries all fee tiers).
    symbol: "USDC",
    name: "USD Coin",
    logoURI: "/USDC.png",
    decimals: 6,
    tokenId: "0.0.456858",
    evmAddress: "0x000000000000000000000000000000000006f87a",
    isActive: true,
    iconBg: "#2775ca",
  },
  // VELO is intentionally omitted from the swap list until the token is officially
  // listed on SaucerSwap. Re-add it here (with its real token ID / EVM address and a
  // confirmed V2 pool) once listing is live.
];

export const ACTIVE_TOKENS = TOKEN_LIST.filter(t => t.isActive);

export const getTokenById = (id: string) => TOKEN_LIST.find(t => t.tokenId === id);
export const getTokenBySymbol = (symbol: string) => TOKEN_LIST.find(t => t.symbol === symbol);
