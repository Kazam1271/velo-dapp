import { ethers } from "ethers";
import { AccountId } from "@hiero-ledger/sdk";

// SaucerSwap V2 QuoterV2 on Hedera Testnet
const QUOTER_CONTRACT_ID = "0.0.1390002";
const HEDERA_JSON_RPC_URL = "https://testnet.hashio.io/api";

// Wrapped HBAR on Testnet
const WHBAR_TOKEN_ID = "0.0.8735222"; // Using the mock WHBAR defined in config/tokens.ts

const QUOTER_ABI = [
  "function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint160[] memory sqrtPriceX96AfterList, uint32[] memory initializedTicksCrossedList, uint256 gasEstimate)",
  "function quoteExactOutput(bytes path, uint256 amountOut) external returns (uint256 amountIn, uint160[] memory sqrtPriceX96AfterList, uint32[] memory initializedTicksCrossedList, uint256 gasEstimate)"
];

/**
 * Converts a Hedera Token ID (0.0.x) to a Solidity EVM Address (0x...)
 */
function toEvmAddress(tokenId: string): string {
  if (tokenId === "NATIVE" || tokenId === "HBAR") {
    return `0x${AccountId.fromString(WHBAR_TOKEN_ID).toSolidityAddress()}`;
  }
  return `0x${AccountId.fromString(tokenId).toSolidityAddress()}`;
}

/**
 * Encodes a path for SaucerSwap V2: [token, fee, token, fee, token, ...]
 * Each token is 20 bytes, each fee is 3 bytes (uint24).
 */
function encodePath(tokens: string[], fees: number[]): string {
  let path = "0x";
  for (let i = 0; i < tokens.length; i++) {
    path += toEvmAddress(tokens[i]).slice(2);
    if (i < fees.length) {
      // Fee is uint24 (3 bytes)
      path += fees[i].toString(16).padStart(6, "0");
    }
  }
  return path;
}

/**
 * Fetches a real-time quote from SaucerSwap V2 Quoter.
 */
export async function getSaucerSwapQuote(
  tokenInId: string,
  tokenOutId: string,
  amountIn: string,
  decimalsIn: number,
  fee: number = 500 // Default 0.05% fee
): Promise<string | null> {
  try {
    const provider = new ethers.JsonRpcProvider(HEDERA_JSON_RPC_URL);
    const quoterAddress = toEvmAddress(QUOTER_CONTRACT_ID);
    const quoter = new ethers.Contract(quoterAddress, QUOTER_ABI, provider);

    const amountInSmallestUnit = ethers.parseUnits(amountIn, decimalsIn);
    
    // Path: [TokenIn, Fee, TokenOut]
    const path = encodePath([tokenInId, tokenOutId], [fee]);

    console.log(`[Quoter] Requesting quote for ${amountIn} (${tokenInId}) -> ${tokenOutId} via path ${path}`);

    // staticCall to simulate the transaction and get the return values
    const result = await quoter.quoteExactInput.staticCall(path, amountInSmallestUnit);
    
    const amountOut = result[0];
    return amountOut.toString();
  } catch (error) {
    console.error("[Quoter] Failed to fetch quote:", error);
    return null;
  }
}
