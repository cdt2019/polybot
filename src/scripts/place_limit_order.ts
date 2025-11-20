import { ClobClient, Side } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import axios from 'axios';
import { PolyMarketService } from '../services/PolyMarketService';
import { loadPrivateKey } from '../core/wallet';

dotenv.config();


async function main() {
    try {
        const privateKey = await loadPrivateKey();
        if (!privateKey) {
            throw new Error('PRIVATE_KEY is not set in environment variables');
        }

        // 1. Get Market Details
        const slug = 'google-gemini-3-score-on-humanitys-last-exam-by-january-31';
        console.log(`Fetching market details for slug: ${slug}...`);
        const market = await PolyMarketService.getMarketForEvent(slug, "35%");

        if (!market) {
            throw new Error(`Market not found for slug: ${slug}`);
        }

        console.log(`Found market: ${market.question}`);
        console.log('Outcomes:', market.outcomes);
        console.log('CLOB Token IDs:', market.clobTokenIds);

        // Default to betting "Yes" (usually the first token ID)
        // You can change this index to 1 for "No"
        const outcomeIndex = 0;
        const tokenId = market.clobTokenIds[outcomeIndex];
        const outcomeLabel = market.outcomes[outcomeIndex];

        console.log(`Selected Outcome: ${outcomeLabel} (Token ID: ${tokenId})`);

        // 2. Initialize CLOB Client
        const signer = new ethers.Wallet(privateKey);
        const chainId = 137; // Polygon Mainnet
        console.log('Initializing Client to derive keys...');
        const initClient = new ClobClient('https://clob.polymarket.com', chainId, signer);

        console.log('Deriving/Creating API Key...');
        const creds = await initClient.createOrDeriveApiKey();
        console.log('API Key:', creds.key);
        console.log('Secret:', creds.secret);
        console.log('Passphrase:', creds.passphrase);

        const client = new ClobClient('https://clob.polymarket.com', chainId, signer, creds);

        // 3. Define Order Parameters
        const price = 0.5; // 50 cents
        const size = 10;   // 10 shares
        const side = Side.BUY;

        console.log(`Placing ${side} order for ${size} shares at $${price}...`);

        // 4. Create and Post Order
        // Note: Placing orders on the CLOB is gasless (signed messages).
        // console.log('Order ID:', resp.orderID);
        // console.log('Status:', resp.status);

    } catch (error) {
        console.error('Error placing limit order:', error);
    }
}

main();
