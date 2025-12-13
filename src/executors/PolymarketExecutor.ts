import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { SignatureType } from "@polymarket/order-utils"

import { ethers } from 'ethers';
import { Executor, Notifier } from '../core/types';
import { logger } from '../core/logger';

export interface OrderParams {
    tokenId: string;
    price: number; // For Limit orders, this is the limit price. For Market orders, this might be ignored or used as a cap.
    size: number;
    side: 'BUY' | 'SELL';
    type: 'LIMIT' | 'MARKET';
    expiration?: number;
    timeInForce?: 'GTC' | 'GTD' | 'FOK' | 'FAK';
}

export class PolymarketExecutor implements Executor<OrderParams> {
    private client: ClobClient;
    private signer: ethers.Wallet;
    private notifier?: Notifier;
    private creds?: any;
    private signatureType: SignatureType;
    private funderAddress?: string;


    constructor(privateKey: string, notifier?: Notifier, chainId: number = 137) {
        this.signer = new ethers.Wallet(privateKey);
        this.notifier = notifier;

        this.funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS;

        if (this.funderAddress) {
            logger.info(`Using funder Address: ${this.funderAddress}`);
        }

        const envSigType = process.env.POLYMARKET_SIGNATURE_TYPE;
        if (envSigType !== undefined && envSigType !== '') {
            const parsed = parseInt(envSigType, 10);
            if (!isNaN(parsed)) {
                this.signatureType = parsed;
                logger.info(`Using Signature Type: ${this.signatureType}`);
            } else {
                this.signatureType = this.funderAddress ? SignatureType.POLY_GNOSIS_SAFE : SignatureType.EOA;
                logger.warn(`Invalid POLYMARKET_SIGNATURE_TYPE: ${envSigType}. Defaulting to ${this.signatureType}.`);
            }
        } else {
            this.signatureType = this.funderAddress ? SignatureType.POLY_GNOSIS_SAFE : SignatureType.EOA;
        }

        // Initial client init (ALWAYS EOA for key derivation)
        this.client = new ClobClient(
            'https://clob.polymarket.com',
            chainId,
            this.signer,
        );
    }

    private async ensureApiKeys() {
        if (!this.creds) {
            if (process.env.CLOB_API_KEY && process.env.CLOB_SECRET && process.env.CLOB_PASS_PHRASE) {
                logger.info('Using API Keys from environment variables.');
                this.creds = {
                    key: process.env.CLOB_API_KEY,
                    secret: process.env.CLOB_SECRET,
                    passphrase: process.env.CLOB_PASS_PHRASE,
                };
            } else {
                logger.info('Deriving API Keys...');
                try {
                    this.creds = await this.client.createOrDeriveApiKey();
                    if (!this.creds) {
                        throw new Error('Derived credentials are null or undefined.');
                    }
                    logger.info(`Derived Creds: Key=${this.creds.key.substring(0, 8)}...`);
                } catch (error: any) {
                    logger.error(`Failed to derive API keys: ${error.message}`);
                    throw new Error(`Failed to derive API keys: ${error.message}`);
                }
            }

            // Re-initialize client with creds AND funder config (if present)
            this.client = new ClobClient(
                'https://clob.polymarket.com',
                137,
                this.signer,
                this.creds,
                this.signatureType,
                this.funderAddress
            );
            logger.info('Client updated with API Credentials and Funder Config.');
        }
    }

    public async execute(order: OrderParams): Promise<boolean> {
        const msg = `Executing ${order.type} order: ${order.side} ${order.size} of ${order.tokenId} at ${order.type === 'LIMIT' ? order.price : 'MARKET'}`;
        logger.info(msg);
        if (this.notifier) await this.notifier.notify(msg);

        try {
            await this.ensureApiKeys();

            let resp;
            const commonOptions = {
                tokenID: order.tokenId,
                price: order.price,
                side: order.side === 'BUY' ? Side.BUY : Side.SELL,
                feeRateBps: 0,
            };

            if (order.type === 'MARKET') {
                // Market Order
                const orderType = order.timeInForce == 'FAK' ? OrderType.FAK : OrderType.FOK;
                resp = await this.client.createAndPostMarketOrder({
                    ...commonOptions,
                    amount: order.size,
                } as any, undefined, orderType);
            } else {
                // Limit Order
                const orderType = order.timeInForce == 'GTD' ? OrderType.GTD : OrderType.GTC;
                resp = await this.client.createAndPostOrder({
                    ...commonOptions,
                    size: order.size,
                    expiration: order.expiration || 0,
                } as any, undefined, orderType);
            }

            // Validate Response based on Polymarket API Docs
            // Response Format: { success: boolean, errorMsg: string, orderId: string, status: string, ... }
            const response = resp as any;

            if (response.success === false || (response.errorMsg && response.errorMsg !== '')) {
                const errorReason = response.errorMsg || JSON.stringify(response);
                throw new Error(`Order placement failed. Reason: ${errorReason}`);
            }

            // Additional check for "error" field which might be present in some client-side error cases
            if (response.error) {
                throw new Error(`Order placement failed. Error: ${response.error}`);
            }

            const successMsg = `✅ *Order Placed Successfully!*

🆔 *ID:* \`${response.orderID}\`
📊 *Status:* ${response.status}
🪙 *Token:* \`${order.tokenId}\`

🔹 *Side:* ${order.side}
📏 *Size:* ${order.size}
💲 *Price:* ${order.type === 'LIMIT' ? order.price : 'MARKET'}`;

            logger.info(`Order placed: ${JSON.stringify(response)}`);
            if (this.notifier) await this.notifier.notify(successMsg);

            return true;
        } catch (error: any) {
            const errorMsg = error.message || JSON.stringify(error);
            logger.error('Failed to execute order:', error);

            // Check for Cloudflare 403
            if (errorMsg.includes('Cloudflare') || errorMsg.includes('403 Forbidden')) {
                logger.warn('⚠️ Potential Cloudflare Block Detected! The bot might be blocked by Polymarket security.');
            }

            if (this.notifier) await this.notifier.notify(`Failed to execute order: ${errorMsg}`);
        }
        return false;
    }
}
