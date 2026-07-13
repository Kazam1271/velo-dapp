const axios = require("axios");

const ACCOUNTS = [
    // Batch 1
    "0.0.8812010", "0.0.8812023", "0.0.8812024", "0.0.8812037", 
    "0.0.8812083", "0.0.8812095", "0.0.8812039", "0.0.8812084",
    // Batch 2
    "0.0.8752628", "0.0.8642991", "0.0.8642997"
];

async function checkBalances() {
    console.log("Checking balances for all known source wallets...\n");
    let total = 0;
    for (const id of ACCOUNTS) {
        try {
            const response = await axios.get(`https://testnet.mirrornode.hedera.com/api/v1/accounts/${id}`, { timeout: 10000 });
            const balance = response.data.balance.balance / 100000000;
            console.log(`Account: ${id} | Balance: ${balance.toFixed(2)} HBAR`);
            if (balance > 1) total += (balance - 0.5); // Move everything above 0.5
        } catch (error) {
            console.error(`Failed to fetch for ${id}:`, error.message);
        }
    }
    console.log(`\nPotential HBAR to consolidate: ~${total.toFixed(2)} HBAR`);
}

checkBalances();
