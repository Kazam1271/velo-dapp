import {
  ContractExecuteTransaction,
  ContractFunctionParameters,
  AccountId,
  ContractId,
  AccountAllowanceApproveTransaction,
  TokenId,
  Hbar
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
    const signer = hashconnect.getSigner(AccountId.fromString(accountId) as any) as any;

    // 2. IMPORTANT: Approve the Velo Router Contract to spend Token A on behalf of the user.
    // (If you handle allowances globally elsewhere, you can omit this step).
    const allowanceTx = new AccountAllowanceApproveTransaction()
      .approveTokenAllowance(
        TokenId.fromString(tokenAId),
        AccountId.fromString(accountId),
        AccountId.fromString(routerContractId),
        amountIn
      );
      
    await (allowanceTx as any).freezeWithSigner(signer);
    const allowanceResponse = await (allowanceTx as any).executeWithSigner(signer);
    const allowanceReceipt = await (allowanceResponse as any).getReceiptWithSigner(signer);
    
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
      .setFunction("executeMockSwap", functionParams)
      .setPayableAmount(new Hbar(0.25));

    // 5. Freeze the transaction with the signer's node/network configuration
    await (swapTransaction as any).freezeWithSigner(signer);

    // 6. Execute the transaction via HashConnect (prompts the user's wallet to sign the contract call)
    const txResponse = await (swapTransaction as any).executeWithSigner(signer);

    // 7. Wait for the transaction receipt to confirm success on the ledger
    const receipt = await (txResponse as any).getReceiptWithSigner(signer);

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

/**
 * Executes an HBAR → Token swap via the VeloMockRouter smart contract.
 * HBAR is attached directly to the ContractExecuteTransaction (payable call).
 */
export async function executeHbarSwap(
  hashconnect: HashConnect,
  accountId: string,
  routerContractId: string,
  tokenBAddress: string,
  hbarAmountIn: number,
  amountBOut: number
): Promise<string> {
  try {
    const signer = hashconnect.getSigner(AccountId.fromString(accountId) as any) as any;

    const functionParams = new ContractFunctionParameters()
      .addAddress(tokenBAddress)
      .addUint256(amountBOut);

    const swapTx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromString(routerContractId))
      .setGas(500_000)
      .setFunction("swapHbarForToken", functionParams)
      .setPayableAmount(new Hbar(hbarAmountIn));

    await (swapTx as any).freezeWithSigner(signer);
    const txResponse = await (swapTx as any).executeWithSigner(signer);
    const receipt = await (txResponse as any).getReceiptWithSigner(signer);

    if (receipt.status.toString() !== "SUCCESS") {
      throw new Error(`HBAR swap failed with status: ${receipt.status.toString()}`);
    }

    return txResponse.transactionId.toString();
  } catch (error) {
    console.error("[Velo] HBAR Swap Execution Error:", error);
    throw error;
  }
}

/**
 * Executes a Token → HBAR swap via the VeloMockRouter smart contract.
 * Step 1: Approves the contract to spend the user's input token.
 * Step 2: Calls swapTokenForHbar() which pulls the token from the user and emits an event.
 * The backend then verifies the contract call and sends HBAR to the user.
 *
 * @param hashconnect      The initialized HashConnect instance.
 * @param accountId        The connected user's Hedera Account ID.
 * @param routerContractId The Hedera Contract ID of the deployed VeloMockRouter.
 * @param tokenInId        Hedera Token ID of the input token (e.g. "0.0.8735221" for USDC).
 * @param tokenInAddress   EVM address of the input token.
 * @param amountIn         Amount to swap in the token's smallest unit.
 * @returns The Hedera transaction ID of the contract call on success.
 */
export async function executeTokenForHbarSwap(
  hashconnect: HashConnect,
  accountId: string,
  routerContractId: string,
  tokenInId: string,
  tokenInAddress: string,
  amountIn: number
): Promise<string> {
  try {
    const signer = hashconnect.getSigner(AccountId.fromString(accountId) as any) as any;

    // Step 1: Approve contract to spend user's input token
    const allowanceTx = new AccountAllowanceApproveTransaction()
      .approveTokenAllowance(
        TokenId.fromString(tokenInId),
        AccountId.fromString(accountId),
        AccountId.fromString(routerContractId),
        amountIn
      );

    await (allowanceTx as any).freezeWithSigner(signer);
    const allowanceResponse = await (allowanceTx as any).executeWithSigner(signer);
    await (allowanceResponse as any).getReceiptWithSigner(signer);

    // Step 2: Call swapTokenForHbar — contract pulls the token, emits HbarSwapRequested
    const functionParams = new ContractFunctionParameters()
      .addAddress(tokenInAddress)
      .addUint256(amountIn);

    const swapTx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromString(routerContractId))
      .setGas(500_000)
      .setFunction("swapTokenForHbar", functionParams)
      .setPayableAmount(new Hbar(0.25));

    await (swapTx as any).freezeWithSigner(signer);
    const txResponse = await (swapTx as any).executeWithSigner(signer);
    const receipt = await (txResponse as any).getReceiptWithSigner(signer);

    if (receipt.status.toString() !== "SUCCESS") {
      throw new Error(`Token→HBAR swap failed with status: ${receipt.status.toString()}`);
    }

    return txResponse.transactionId.toString();
  } catch (error) {
    console.error("[Velo] Token→HBAR Swap Execution Error:", error);
    throw error;
  }
}
