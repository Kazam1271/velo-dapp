import {
  ContractExecuteTransaction,
  ContractFunctionParameters,
  AccountId,
  ContractId,
  AccountAllowanceApproveTransaction,
  TokenId
} from "@hiero-ledger/sdk";
import { HashConnect } from "hashconnect";

/**
 * Executes the mock swap on the VeloMockRouter smart contract via HashConnect.
 * 
 * @param hashconnect - The initialized HashConnect instance.
 * @param accountId - The connected user's Hedera Account ID (e.g., "0.0.12345").
 * @param routerContractId - The Hedera Contract ID of the deployed VeloMockRouter (e.g., "0.0.98765").
 * @param tokenAId - The Hedera Token ID for Token A (e.g., "0.0.8734118").
 * @param tokenAAddress - The EVM address of Token A (derived from Hedera Token ID).
 * @param tokenBAddress - The EVM address of Token B (derived from Hedera Token ID).
 * @param amountIn - The amount of Token A to swap, parsed to its lowest denomination (e.g., 1,000,000 for 1 token with 6 decimals).
 * @returns The Hedera transaction ID upon success.
 */
export async function executeVeloMockSwap(
  hashconnect: HashConnect,
  accountId: string,
  routerContractId: string,
  tokenAId: string,
  tokenAAddress: string,
  tokenBAddress: string,
  amountIn: number
): Promise<string> {
  try {
    // 1. Get the HashConnect signer for the connected user account
    const signer = hashconnect.getSigner(AccountId.fromString(accountId));

    // 2. IMPORTANT: Approve the Velo Router Contract to spend Token A on behalf of the user.
    // (If you handle allowances globally elsewhere, you can omit this step).
    const allowanceTx = new AccountAllowanceApproveTransaction()
      .approveTokenAllowance(
        TokenId.fromString(tokenAId),
        AccountId.fromString(accountId),
        AccountId.fromString(routerContractId),
        amountIn
      );
      
    await allowanceTx.freezeWithSigner(signer);
    const allowanceResponse = await allowanceTx.executeWithSigner(signer);
    const allowanceReceipt = await allowanceResponse.getReceiptWithSigner(signer);
    
    if (allowanceReceipt.status.toString() !== "SUCCESS") {
      throw new Error("Token allowance approval failed.");
    }

    // 3. Construct the contract function parameters for `executeMockSwap`
    // Solidity signature: executeMockSwap(address tokenA, address tokenB, uint256 amountAIn)
    const functionParams = new ContractFunctionParameters()
      .addAddress(tokenAAddress)
      .addAddress(tokenBAddress)
      .addUint256(amountIn);

    // 4. Build the Contract Execute Transaction
    const swapTransaction = new ContractExecuteTransaction()
      .setContractId(ContractId.fromString(routerContractId))
      .setGas(1_500_000) // Configure adequate gas limit for EVM transfer logic
      .setFunction("executeMockSwap", functionParams);

    // 5. Freeze the transaction with the signer's node/network configuration
    await swapTransaction.freezeWithSigner(signer);

    // 6. Execute the transaction via HashConnect (prompts the user's wallet to sign the contract call)
    const txResponse = await swapTransaction.executeWithSigner(signer);

    // 7. Wait for the transaction receipt to confirm success on the ledger
    const receipt = await txResponse.getReceiptWithSigner(signer);

    if (receipt.status.toString() !== "SUCCESS") {
      throw new Error(`Swap failed with status: ${receipt.status.toString()}`);
    }

    // Return the successful transaction ID (e.g. for linking to HashScan)
    return txResponse.transactionId.toString();

  } catch (error) {
    console.error("[Velo] Mock Swap Execution Error:", error);
    throw error;
  }
}
