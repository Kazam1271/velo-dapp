import { ethers } from "ethers";
import { Token } from "@/config/tokens";

// ─── SaucerSwap V1 Router (Testnet) ─────────────────────────────────────────
const ROUTER_ADDRESS = "0x0000000000000000000000000000000000004b40"; // 0.0.19264
const RELAY_URL = "https://testnet.hashio.io/api";

// WHBAR testnet address – required as path[0] when paying HBAR
const WHBAR_EVM = "0x0000000000000000000000000000000000003ad2"; // 0.0.15058

const ROUTER_ABI = [
  "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
];

/** Convert a Hedera "0.0.X" token ID to a zero-padded 20-byte EVM address */
function tokenIdToEvm(tokenId: string): string {
  if (tokenId === "NATIVE" || tokenId === "0.0.15058") return WHBAR_EVM;
  const num = BigInt(tokenId.split(".")[2]);
  return "0x" + num.toString(16).padStart(40, "0");
}

export interface QuoteResult {
  amountOut: string;   // human-readable (e.g. "3.521")
  rawAmountOut: bigint;
}

/**
 * Calls SaucerSwap V1 Router getAmountsOut on the Hedera Testnet relay.
 * Returns null if the pair has no liquidity or the call fails.
 */
export async function getSaucerQuote(
  amountIn: number,
  payToken: Token,
  recvToken: Token
): Promise<QuoteResult | null> {
  try {
    const provider = new ethers.JsonRpcProvider(RELAY_URL);
    const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider);

    // Build the path array; HBAR must be represented as WHBAR
    const fromEvm = payToken.symbol === "HBAR" ? WHBAR_EVM : tokenIdToEvm(payToken.tokenId);
    const toEvm = recvToken.symbol === "HBAR" ? WHBAR_EVM : tokenIdToEvm(recvToken.tokenId);

    if (fromEvm === toEvm) return null;

    // Convert to tiny-units
    const amountInRaw = BigInt(Math.round(amountIn * Math.pow(10, payToken.decimals)));
    if (amountInRaw === BigInt(0)) return null;

    const path = [fromEvm, toEvm];

    const amounts: bigint[] = await router.getAmountsOut(amountInRaw, path);
    const rawAmountOut = amounts[amounts.length - 1];

    // Convert back to human-readable using recv token decimals
    const amountOut = (Number(rawAmountOut) / Math.pow(10, recvToken.decimals)).toFixed(6);

    return { amountOut, rawAmountOut };
  } catch (err) {
    console.warn("[SaucerQuote] Failed to get quote:", err);
    return null;
  }
}
