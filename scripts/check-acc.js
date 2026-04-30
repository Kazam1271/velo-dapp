const axios = require("axios");

async function check() {
    for (let i = 0; i < 10; i++) {
        try {
            console.log(`Attempt ${i+1}...`);
            const res = await axios.get("https://testnet.mirrornode.hedera.com/api/v1/accounts/0.0.8752628", { timeout: 10000 });
            console.log("Account Key:", res.data.key);
            process.exit(0);
        } catch (e) {
            console.error(e.message);
        }
        await new Promise(r => setTimeout(r, 2000));
    }
}
check();
