import { ethers } from "ethers";
import { loadPrivateKey } from "../core/wallet";
import { ClobClient } from "@polymarket/clob-client";

async function main() {

    const privateKey = await loadPrivateKey();
    const signer = new ethers.Wallet(privateKey);
    let client = new ClobClient(
        'https://clob.polymarket.com',
        137,
        signer
    );
    const creds = await client.createOrDeriveApiKey();
    console.log(creds);
    console.log(`CLOB_API_KEY=${creds.key}`);
    console.log(`CLOB_SECRET=${creds.secret}`);
    console.log(`CLOB_PASS_PHRASE=${creds.passphrase}`);

    client = new ClobClient(
        'https://clob.polymarket.com',
        137,
        signer,
        creds
    );
    const apkye = await client.getApiKeys()

    console.log(apkye)
}

main().catch(console.error);