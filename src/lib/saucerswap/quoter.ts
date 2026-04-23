import { ethers } from "ethers";
import { AccountId } from "@hiero-ledger/sdk";

// SaucerSwap V2 QuoterV2 on Hedera Testnet
const QUOTER_CONTRACT_ID = "0.0.3945935"; 
const HEDERA_JSON_RPC_URL = "https://testnet.hashio.io/api";

// Wrapped HBAR on Testnet
const WHBAR_TOKEN_ID = "0.0.1505995"; 

const QUOTER_V2_ABI = [
  {
    "inputs": [
      {
        "components": [
          { "internalType": "address", "name": "tokenIn", "type": "address" },
          { "internalType": "address", "name": "tokenOut", "type": "address" },
          { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
          { "internalType": "uint24", "name": "fee", "type": "uint24" },
          { "internalType": "uint160", "name": "sqrtPriceLimitX96", "type": "uint160" }
        ],
        "internalType": "struct IQuoterV2.QuoteExactInputSingleParams",
        "name": "params",
        "type": "tuple"
      }
    ],
    "name": "quoteExactInputSingle",
    "outputs": [
      { "internalType": "uint256", "name": "amountOut", "type": "uint256" },
      { "internalType": "uint160", "name": "sqrtPriceX96After", "type": "uint160" },
      { "internalType": "uint32", "name": "initializedTicksCrossed", "type": "uint32" },
      { "internalType": "uint256", "name": "gasEstimate", "type": "uint256" }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
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
 * Fetches a real-time quote from SaucerSwap V2 QuoterV2.
 */
export async function getSaucerSwapQuote(
  tokenInId: string,
  tokenOutId: string,
  amountIn: string,
  decimalsIn: number,
  fee: number = 3000 // Default 0.3% pool fee (Standard for SaucerSwap V2 pools)
): Promise<string | null> {
  try {
    const provider = new ethers.JsonRpcProvider(HEDERA_JSON_RPC_URL);
    const quoterAddress = toEvmAddress(QUOTER_CONTRACT_ID);
    const quoter = new ethers.Contract(quoterAddress, QUOTER_V2_ABI, provider);

    const amountInSmallestUnit = ethers.parseUnits(amountIn, decimalsIn);
    
    const params = {
      tokenIn: toEvmAddress(tokenInId),
      tokenOut: toEvmAddress(tokenOutId),
      amountIn: amountInSmallestUnit,
      fee: fee,
      sqrtPriceLimitX96: 0
    };

    console.log(`[QuoterV2] Requesting quote for ${amountIn} (${tokenInId}) -> ${tokenOutId}`);

    // staticCall to simulate the transaction and get the return values
    const result = await quoter.quoteExactInputSingle.staticCall(params);
    
    const amountOut = result.amountOut;
    return amountOut.toString();
  } catch (error) {
    console.error("[QuoterV2] Failed to fetch quote:", error);
    return null;
  }
}
