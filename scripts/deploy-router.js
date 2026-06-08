const solc = require('solc');
const fs = require('fs');
const path = require('path');
const { Client, PrivateKey, ContractCreateFlow } = require('@hiero-ledger/sdk');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

function findImports(importPath) {
    try {
        const fullPath = path.resolve(__dirname, '../node_modules', importPath);
        return { contents: fs.readFileSync(fullPath, 'utf8') };
    } catch (e) {
        return { error: 'File not found' };
    }
}

async function main() {
    const contractPath = path.resolve(__dirname, '../src/contracts/VeloMockRouter.sol');
    const source = fs.readFileSync(contractPath, 'utf8');

    const input = {
        language: 'Solidity',
        sources: {
            'VeloMockRouter.sol': {
                content: source
            }
        },
        settings: {
            outputSelection: {
                '*': {
                    '*': ['*']
                }
            }
        }
    };

    console.log("Compiling VeloMockRouter...");
    const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

    if (output.errors && output.errors.filter(e => e.severity === 'error').length > 0) {
        console.error("Compilation errors:", output.errors);
        return;
    }

    const contract = output.contracts['VeloMockRouter.sol']['VeloMockRouter'];
    const bytecode = contract.evm.bytecode.object;

    console.log("Compiled successfully! Bytecode length:", bytecode.length);

    const operatorId = process.env.TREASURY_ID;
    const operatorKey = process.env.TREASURY_KEY;

    if (!operatorId || !operatorKey) {
        throw new Error("TREASURY_ID and TREASURY_KEY must be set in .env.local");
    }

    const client = Client.forTestnet();
    const cleanKey = operatorKey.startsWith("0x") ? operatorKey.slice(2) : operatorKey;
    const privateKey = PrivateKey.fromStringECDSA(cleanKey);
    client.setOperator(operatorId, privateKey);

    console.log(`Deploying contract as operator: ${operatorId}`);

    // constructor parameters: (address _treasuryWallet, uint256 _feeBasisPoints, uint256 _exchangeRate)
    // We need to convert treasuryWallet (Hedera Account ID) to Solidity address
    // But since it's the operatorId, let's just use its EVM address.
    // Or we can just use AccountId.fromString(operatorId).toSolidityAddress()
    const { AccountId, ContractFunctionParameters } = require('@hiero-ledger/sdk');
    const treasurySolidityAddress = "0x" + AccountId.fromString(process.env.TREASURY_ID || operatorId).toSolidityAddress();

    const constructorParams = new ContractFunctionParameters()
        .addAddress(treasurySolidityAddress)
        .addUint256(100) // 100 bp = 1%
        .addUint256(2);  // 1:2 ratio

    const contractCreateFlow = new ContractCreateFlow()
        .setBytecode(bytecode)
        .setGas(2_000_000)
        .setConstructorParameters(constructorParams);

    const txResponse = await contractCreateFlow.execute(client);
    const receipt = await txResponse.getReceipt(client);
    const newContractId = receipt.contractId;

    console.log(`\n✅ SUCCESS: VeloMockRouter Deployed!`);
    console.log(`CONTRACT ID: ${newContractId.toString()}`);

    // Read SwapInterface.tsx and replace 0.0.9167775 with new contract id
    const swapPath = path.resolve(__dirname, '../src/components/SwapInterface.tsx');
    let swapCode = fs.readFileSync(swapPath, 'utf8');
    swapCode = swapCode.replace(/0\.0\.9167775/g, newContractId.toString());
    fs.writeFileSync(swapPath, swapCode);
    console.log(`Updated SwapInterface.tsx with new Contract ID: ${newContractId.toString()}`);
}

main().catch(console.error);
