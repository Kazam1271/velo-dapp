import { ethers } from "ethers";
import { AccountId } from "@hiero-ledger/sdk";

// SaucerSwap V2 QuoterV2 on Hedera Testnet
const QUOTER_CONTRACT_ID = "0.0.1390002"; 
const WHBAR_TOKEN_ID = "0.0.1505995"; 

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

    const mirrorNodeUrl = `https://testnet.mirrornode.hedera.com/api/v1/contracts/call`;
    
    const response = await fetch(mirrorNodeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: quoterAddress,
        data: encodedData,
        estimate: false,
        gas: 1000000 // Add explicit gas limit for mirror node calls
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
