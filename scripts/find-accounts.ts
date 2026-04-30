import {
    Client,
    PrivateKey,
} from "@hiero-ledger/sdk";
import axios from "axios";

const KEYS = [
    "0xff031d73f443157b3b1d4807af43fcdb88a7db97451cddf6caf6b68ed93f5b50",
    "0x266467b669fedaa66870afbb6bc98fe22caf74482746eff3cd11a472d5804880",
    "0x7f0caf0f167470f82c2803a3d834f2d24c5772953ab49cf009f1cba764eaa082",
    "0x6e800b2cc70f907056e37f86a669ac555efb19288718467bb30c51b64e01aa0f",
    "0xaf493c838640426330b0cf6fc6365b8fedb53b1803b6e7e6a295dd7c7d7281a9",
    "0xc57914865f54931a9f26cd9977a148a9facffaae81f85003a4fcbe31b7272bc1",
    "0x69c26d38ffd6089dce737d43150760fc439763ae7f435d5afd5f29e2759c85fa",
    "0x2fbb545158a4a4d0c975b2e2bac948c4b94eff24ce211b91be17a8f058da9410"
];

async function findAccounts() {
    console.log("Finding Account IDs for the provided keys...\n");
    
    for (const key of KEYS) {
        try {
            const cleanKey = key.startsWith("0x") ? key.slice(2) : key;
            const privateKey = PrivateKey.fromString(cleanKey);
            const publicKey = privateKey.getPublicKey().toStringRaw();
            
            // Query mirror node for account associated with this public key
            const response = await axios.get(`https://testnet.mirrornode.hedera.com/api/v1/accounts?account.publickey=${publicKey}`);
            
            if (response.data.accounts && response.data.accounts.length > 0) {
                const account = response.data.accounts[0];
                console.log(`{ id: "${account.account}", key: "${key}" },`);
            } else {
                console.log(`// [NOT FOUND] No account found for key: ${key}`);
            }
        } catch (error: any) {
            console.error(`// [ERROR] Failed to process key ${key}:`, error.message);
        }
    }
}

findAccounts();
