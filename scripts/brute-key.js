const {
    PrivateKey,
} = require("@hiero-ledger/sdk");

const TARGET_PUB = "0328754e09836f4a39e50764136b53d1cffd86c78bf2d4631a4bcd2361ad9a5013";
const BASE_KEY = "c98a40a0c634c5967db5d7764233345f21e526b92811bec116230b1d416490926";

function find() {
    console.log("Searching for private key typo...");
    
    // Test variations by removing/replacing characters
    for (let i = 0; i < BASE_KEY.length; i++) {
        const test = BASE_KEY.slice(0, i) + BASE_KEY.slice(i + 1);
        if (test.length !== 64) continue;
        
        try {
            const pk = PrivateKey.fromStringECDSA(test);
            if (pk.publicKey.toStringRaw() === TARGET_PUB) {
                console.log(`✅ FOUND! Correct Private Key: 0x${test}`);
                return;
            }
        } catch (e) {}
    }
    
    console.log("Not found in single-char deletion. Trying more complex...");
}

find();
