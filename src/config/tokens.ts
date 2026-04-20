export interface Token {
  symbol: string;
  name: string;
  icon: string;
  decimals: number;
}

export const TOKENS: Record<string, Token> = {
  HBAR: {
    symbol: "HBAR",
    name: "Hedera",
    icon: "https://cryptologos.cc/logos/hedera-hbar-logo.svg",
    decimals: 8,
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    icon: "https://cryptologos.cc/logos/usd-coin-usdc-logo.svg",
    decimals: 6,
  },
  SAUCE: {
    symbol: "SAUCE",
    name: "Sauce",
    icon: "https://www.saucerswap.finance/logo.svg",
    decimals: 6,
  },
};
