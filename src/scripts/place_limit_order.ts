import { ApiKeyCreds, ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { SignatureType } from "@polymarket/order-utils"
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { PolyMarketService } from '../services/PolyMarketService';
import { loadPrivateKey } from '../core/wallet';
import { OrderParams, PolymarketExecutor } from '../executors/PolymarketExecutor';
import { Notifier } from '../core/types';
import { logger } from '../core/logger';
import { TelegramNotifier } from '../notifiers/TelegramNotifier';
import { ConsoleNotifier } from '../notifiers/ConsoleNotifier';

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
        const market = await PolyMarketService.getMarketForEvent(slug, "40%+");

        if (!market) {
            throw new Error(`Market not found for slug: ${slug}`);
        }

        console.log(`Found market: ${market.question}`);
        console.log('Outcomes:', market.outcomes);
        console.log('CLOB Token IDs:', market.clobTokenIds);
        console.log('orderMinSize:', market.orderMinSize);
        console.log('orderPriceMinTickSize:', market.orderPriceMinTickSize);
        console.log('negRisk:', market.negRisk);

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
        const funder = process.env.POLYMARKET_FUNDER_ADDRESS;

        let signatureType = SignatureType.POLY_GNOSIS_SAFE;
        if (process.env.POLYMARKET_SIGNATURE_TYPE) {
            signatureType = parseInt(process.env.POLYMARKET_SIGNATURE_TYPE)
        }
        //const initClient = new ClobClient('https://clob.polymarket.com', chainId, signer);

        const creds = {
            key: process.env.CLOB_API_KEY,
            secret: process.env.CLOB_SECRET,
            passphrase: process.env.CLOB_PASS_PHRASE
        } as ApiKeyCreds;
        // console.log('Deriving/Creating API Key...');
        // const creds = await initClient.createOrDeriveApiKey();
        console.log('API Key:', creds.key);
        console.log('Secret:', creds.secret);
        console.log('Passphrase:', creds.passphrase);

        const client = new ClobClient('https://clob.polymarket.com', chainId, signer, creds, signatureType, funder);

        // 3. Define Order Parameters
        let order = {
            tokenId: tokenId,
            price: 0.1,
            size: 10,
            side: 'BUY',
            type: 'LIMIT',
        } as OrderParams;


        console.log(`Placing token ${tokenId} of ${order.side} order for ${order.size} shares at $${order.price}...`);

        // Initialize Notifier
        let notifier: Notifier;
        if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
            logger.info('Using Telegram Notifier');
            notifier = new TelegramNotifier(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID);
        } else {
            logger.info('Using Console Notifier (Telegram config missing)');
            notifier = new ConsoleNotifier();
        }


        const excutor = new PolymarketExecutor(privateKey, notifier, 137);
        await excutor.execute(order)
        // const commonOptions = {
        //     tokenID: order.tokenId,
        //     feeRateBps: 0,
        // };
        //         const resp = await client.createAndPostOrder({
        //             ...commonOptions,
        //             price: order.price,
        //             side: order.side === 'BUY' ? Side.BUY : Side.SELL,
        //             size: order.size,
        //         }, {
        //             tickSize: "0.01",
        //             negRisk: false,
        //         }, OrderType.GTC);

        //         // Validate Response based on Polymarket API Docs
        //         // Response Format: { success: boolean, errorMsg: string, orderId: string, status: string, ... }
        //         const response = resp as any;

        //         if (response.success === false || (response.errorMsg && response.errorMsg !== '')) {
        //             const errorReason = response.errorMsg || JSON.stringify(response);
        //             throw new Error(`Order placement failed. Reason: ${errorReason}`);
        //         }

        //         // Additional check for "error" field which might be present in some client-side error cases
        //         if (response.error) {
        //             throw new Error(`Order placement failed. Error: ${response.error}`);
        //         }

        //         const successMsg = `✅ *Order Placed Successfully!*

        // 🆔 *ID:* \`${response.orderID}\`
        // 📊 *Status:* ${response.status}
        // 🪙 *Token:* \`${order.tokenId}\`

        // 🔹 *Side:* ${order.side}
        // 📏 *Size:* ${order.size}
        // 💲 *Price:* ${order.type === 'LIMIT' ? order.price : 'MARKET'}`;

        //         logger.info(`Order placed: ${JSON.stringify(response)}`);
        //         if (notifier) await notifier.notify(successMsg);

    } catch (error) {
        console.error('Error placing limit order:', error);
    }
}

main().catch(console.error);
