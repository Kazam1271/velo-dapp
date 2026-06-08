const fs = require('fs');
const solc = require('solc');
const { Client, PrivateKey, ContractCreateFlow, ContractFunctionParameters, AccountId } = require('../node_modules/@hiero-ledger/sdk');
require('../node_modules/dotenv').config({ path: '../.env.local' });

async function main() {
    console.log("Compiling contract...");
    const source = fs.readFileSync('VeloMockRouterFlat.sol', 'utf8');

    const input = {
        language: 'Solidity',
        sources: {
            'VeloMockRouterFlat.sol': {
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

    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    
    if (output.errors) {
        output.errors.forEach(err => console.error(err.formattedMessage));
        const hasErrors = output.errors.some(err => err.severity === 'error');
        if (hasErrors) process.exit(1);
    }

    const contractFile = output.contracts['VeloMockRouterFlat.sol']['VeloMockRouter'];
    const bytecode = contractFile.evm.bytecode.object;
    console.log("Compiled successfully! Bytecode length:", bytecode.length);

    console.log("Deploying to Hedera Testnet...");
    const operatorId = process.env.TREASURY_ID;
    let operatorKeyStr = process.env.TREASURY_KEY;
    
    if (!operatorId || !operatorKeyStr) {
        throw new Error("TREASURY_ID or TREASURY_KEY missing in .env.local");
    }

    const cleanKey = operatorKeyStr.startsWith("0x") ? operatorKeyStr.slice(2) : operatorKeyStr;
    let operatorKey;
    try {
        operatorKey = PrivateKey.fromStringECDSA(cleanKey);
    } catch(e) {
        operatorKey = PrivateKey.fromStringED25519(cleanKey);
    }

    const client = Client.forTestnet();
    client.setOperator(operatorId, operatorKey);

    const treasuryId = process.env.TREASURY_ID || "0.0.8642596";
    const treasuryEvmAddress = "0x" + AccountId.fromString(treasuryId).toSolidityAddress();

    const constructorParams = new ContractFunctionParameters()
        .addAddress(treasuryEvmAddress)
        .addUint256(100) // 1% fee
        .addUint256(2);  // Exchange rate 2

    const contractCreate = new ContractCreateFlow()
        .setBytecode(bytecode)
        .setGas(2000000)
        .setConstructorParameters(constructorParams);

    const txResponse = await contractCreate.execute(client);
    const receipt = await txResponse.getReceipt(client);
    const newContractId = receipt.contractId;

    console.log(`\n✅ SUCCESS! VeloMockRouter Contract Deployed!`);
    console.log(`Contract ID: ${newContractId.toString()}`);
    console.log(`EVM Address: 0x${newContractId.toSolidityAddress()}`);
    
    process.exit(0);
}

main().catch(console.error);
