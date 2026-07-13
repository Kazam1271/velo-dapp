import { ethers } from "ethers";
import { AccountId } from "@hiero-ledger/sdk";

// SaucerSwap V2 QuoterV2 on Hedera Mainnet
// Ref: https://docs.saucerswap.finance/developerx/contract-deployments
const QUOTER_CONTRACT_ID = "0.0.3949424";
const WHBAR_TOKEN_ID = "0.0.1456986";

const QUOTER_V2_ABI = [
  "function quoteExactInputSingle(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
];

/**
 * Converts a Hedera Token ID (0.0.x) to a Solidity EVM Address (0x...)
 */
function toEvmAddress(tokenId: string): string {
  if (tokenId === "NATIVE" || tokenId === "HBAR") {
    return `0x${AccountId.fromString(WHBAR_TOKEN_ID).toSolidityAddress()}`;
  }
  // Ensure we have a valid 0.0.x format
  const id = tokenId.includes(".") ? tokenId : `0.0.${tokenId}`;
  return `0x${AccountId.fromString(id).toSolidityAddress()}`;
}

/**
 * Fetches a real-time quote from SaucerSwap V2 QuoterV2 via Mirror Node.
 */
export async function getSaucerSwapQuote(
  tokenInId: string,
  tokenOutId: string,
  amountIn: string,
  decimalsIn: number,
  fee: number = 3000
): Promise<string | null> {
  const abiInterfaces = new ethers.Interface(QUOTER_V2_ABI);
  
  try {
    const amountInSmallestUnit = ethers.parseUnits(amountIn, decimalsIn);
    
    const params = {
      tokenIn: toEvmAddress(tokenInId),
      tokenOut: toEvmAddress(tokenOutId),
      amountIn: amountInSmallestUnit,
      fee: fee,
      sqrtPriceLimitX96: 0
    };

    const encodedData = abiInterfaces.encodeFunctionData('quoteExactInputSingle', [params]);
    const quoterAddress = toEvmAddress(QUOTER_CONTRACT_ID);

    console.log(`[QuoterV2] Requesting Mirror Node quote for ${amountIn} (${tokenInId}) -> ${tokenOutId}`);

    const mirrorNodeUrl = `https://mainnet-public.mirrornode.hedera.com/api/v1/contracts/call`;
    
    const response = await fetch(mirrorNodeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: quoterAddress,
        data: encodedData,
        estimate: false
      })
    });

    if (!response.ok) {
      throw new Error(`Mirror Node API failed: ${response.statusText}`);
    }

    const resultData = await response.json();
    
    if (!resultData.result) {
      throw new Error("No result returned from Mirror Node");
    }

    const decoded = abiInterfaces.decodeFunctionResult('quoteExactInputSingle', resultData.result);
    const expectedAmountOut = decoded.amountOut;

    return expectedAmountOut.toString();
  } catch (error) {
    console.error("[QuoterV2] Failed to fetch quote from Mirror Node:", error);
    return null;
  }
}

// SaucerSwap V2 fee tiers (in hundredths of a bip): 0.05%, 0.15%, 0.30%, 1.00%.
// Ordered most-common-first so a hit is usually found on the first tier.
const FEE_TIERS = [3000, 1500, 500, 10000];

/**
 * Tries every SaucerSwap V2 fee tier and returns the pool that gives the best
 * output, so any token with a direct pool works regardless of its fee tier.
 */
export async function getBestSaucerSwapQuote(
  tokenInId: string,
  tokenOutId: string,
  amountIn: string,
  decimalsIn: number
): Promise<{ amountOut: string; fee: number } | null> {
  const results = await Promise.all(
    FEE_TIERS.map(async (fee) => {
      const out = await getSaucerSwapQuote(tokenInId, tokenOutId, amountIn, decimalsIn, fee);
      return out && out !== "0" ? { amountOut: out, fee } : null;
    })
  );

  let best: { amountOut: string; fee: number } | null = null;
  for (const r of results) {
    if (r && (!best || BigInt(r.amountOut) > BigInt(best.amountOut))) best = r;
  }
  return best;
}
