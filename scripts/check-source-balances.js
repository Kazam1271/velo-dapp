const axios = require("axios");

const ACCOUNTS = [
    "0.0.8812010",
    "0.0.8812023",
    "0.0.8812024",
    "0.0.8812037",
    "0.0.8812083",
    "0.0.8812095",
    "0.0.8812039",
    "0.0.8812084"
];

async function checkBalances() {
    console.log("Checking balances for consolidation...\n");
    for (const id of ACCOUNTS) {
        try {
            const response = await axios.get(`https://testnet.mirrornode.hedera.com/api/v1/accounts/${id}`);
            const balance = response.data.balance.balance / 100000000;
            console.log(`Account: ${id} | Balance: ${balance.toFixed(2)} HBAR`);
        } catch (error) {
            console.error(`Failed to fetch for ${id}:`, error.message);
        }
    }
}

checkBalances();
