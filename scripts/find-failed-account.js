const {
    PrivateKey,
} = require("@hiero-ledger/sdk");
const axios = require("axios");

const KEYS = [
    "0xc98a40a0c634c5967db5d7764233345f21e526b92811bec116230b1d416490926"
];

async function findAccounts() {
    console.log("Finding Account IDs for the provided keys...\n");
    
    for (const key of KEYS) {
        try {
            const cleanKey = key.startsWith("0x") ? key.slice(2) : key;
            let privateKey;
            
            try {
                privateKey = PrivateKey.fromStringECDSA(cleanKey);
            } catch (e) {
                privateKey = PrivateKey.fromStringED25519(cleanKey);
            }
            
            const publicKey = privateKey.publicKey.toStringRaw();
            
            const response = await axios.get(`https://testnet.mirrornode.hedera.com/api/v1/accounts?account.publickey=${publicKey}`);
            
            if (response.data.accounts && response.data.accounts.length > 0) {
                const account = response.data.accounts[0];
                console.log(`{ id: "${account.account}", key: "${key}" },`);
            } else {
                console.log(`// [NOT FOUND] No account found for key: ${key} (Pub: ${publicKey})`);
            }
        } catch (error) {
            console.error(`// [ERROR] Failed for ${key}:`, error.message);
        }
    }
}

findAccounts();
