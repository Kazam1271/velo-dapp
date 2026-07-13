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
    // xSAUCE (staked SAUCE), 6 decimals. WHBAR pool is thin (~$36k) — kept
    // listed but expect wider pricing than SAUCE.
    symbol: "xSAUCE",
    name: "Staked SAUCE",
    logoURI: "https://dwk1opv266jxs.cloudfront.net/icons/tokens/0.0.1460200-2.png",
    decimals: 6,
    tokenId: "0.0.1460200",
    evmAddress: "0x00000000000000000000000000000000001647e8",
    isActive: true,
    iconBg: "#000000",
  },
  {
    // USD Coin (native Circle USDC on Hedera). 6 decimals. ~$4.9M WHBAR pool (0.15%).
    // EVM address verified via mirror node: 0.0.456858 = 0x…06f89a
    // (was 0x…06f87a = 0.0.456826, which would have made USDC swaps fail).
    symbol: "USDC",
    name: "USD Coin",
    logoURI: "/USDC.png",
    decimals: 6,
    tokenId: "0.0.456858",
    evmAddress: "0x000000000000000000000000000000000006f89a",
    isActive: true,
    iconBg: "#2775ca",
  },
  {
    // Stader HBARX (liquid-staked HBAR), 8 decimals. ~$2.4M WHBAR pool (0.15%).
    symbol: "HBARX",
    name: "HBARX (Stader)",
    logoURI: "https://dwk1opv266jxs.cloudfront.net/icons/tokens/0.0.834116.svg",
    decimals: 8,
    tokenId: "0.0.834116",
    evmAddress: "0x00000000000000000000000000000000000cba44",
    isActive: true,
    iconBg: "#000000",
  },
  {
    // BONZO (Bonzo Finance), 8 decimals. ~$380k WHBAR pool (0.30%).
    symbol: "BONZO",
    name: "Bonzo Finance",
    logoURI: "https://dwk1opv266jxs.cloudfront.net/icons/tokens/0.0.8279134.png",
    decimals: 8,
    tokenId: "0.0.8279134",
    evmAddress: "0x00000000000000000000000000000000007e545e",
    isActive: true,
    iconBg: "#000000",
  },
  {
    // DOVU, 8 decimals. ~$370k WHBAR pool at the 1% fee tier (the quoter
    // tries all tiers, so the 10000 tier is picked up automatically).
    symbol: "DOVU",
    name: "Dovu",
    logoURI: "https://dwk1opv266jxs.cloudfront.net/icons/tokens/0.0.3716059.svg",
    decimals: 8,
    tokenId: "0.0.3716059",
    evmAddress: "0x000000000000000000000000000000000038b3db",
    isActive: true,
    iconBg: "#000000",
  },
  {
    // PACK (HashPack), 6 decimals. ~$210k WHBAR pool (0.30%).
    symbol: "PACK",
    name: "HashPack",
    logoURI: "https://dwk1opv266jxs.cloudfront.net/icons/tokens/0.0.4794920.png",
    decimals: 6,
    tokenId: "0.0.4794920",
    evmAddress: "0x0000000000000000000000000000000000492a28",
    isActive: true,
    iconBg: "#000000",
  },
  // VELO is intentionally omitted from the swap list until the token is officially
  // listed on SaucerSwap. Re-add it here (with its real token ID / EVM address and a
  // confirmed V2 pool) once listing is live.
];

export const ACTIVE_TOKENS = TOKEN_LIST.filter(t => t.isActive);

export const getTokenById = (id: string) => TOKEN_LIST.find(t => t.tokenId === id);
export const getTokenBySymbol = (symbol: string) => TOKEN_LIST.find(t => t.symbol === symbol);
