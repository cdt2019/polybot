import { ClobClient, Side, OrderType } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import { Executor, Notifier } from '../core/types';
import { logger } from '../core/logger';

export interface OrderParams {
    tokenId: string;
    price: number; // For Limit orders, this is the limit price. For Market orders, this might be ignored or used as a cap.
    size: number;
    side: 'BUY' | 'SELL';
    type: 'LIMIT' | 'MARKET';
}

export class PolymarketExecutor implements Executor<OrderParams> {
    private client: ClobClient;
    private signer: ethers.Wallet;
    private notifier?: Notifier;
    private creds?: any;

    constructor(privateKey: string, notifier?: Notifier, chainId: number = 137) {
        this.signer = new ethers.Wallet(privateKey);
        this.client = new ClobClient(
            'https://clob.polymarket.com',
            chainId,
            this.signer
        );
        this.notifier = notifier;
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
                this.creds = await this.client.createOrDeriveApiKey();
            }

            // Re-initialize client with creds
            this.client = new ClobClient(
                'https://clob.polymarket.com',
                137,
                this.signer,
                this.creds
            );
            logger.info('Client updated with API Credentials.');
        }
    }

    public async execute(order: OrderParams): Promise<void> {
        const msg = `Executing ${order.type} order: ${order.side} ${order.size} of ${order.tokenId} at ${order.type === 'LIMIT' ? order.price : 'MARKET'}`;
        logger.info(msg);
        if (this.notifier) await this.notifier.notify(msg);

        try {
            await this.ensureApiKeys();

            let resp;
            if (order.type === 'MARKET') {
                // Market Order
                resp = await this.client.createAndPostMarketOrder({
                    tokenID: order.tokenId,
                    amount: order.size,
                    side: order.side === 'BUY' ? Side.BUY : Side.SELL,
                    feeRateBps: 0,
                    nonce: Date.now(),
                });
            } else {
                // Limit Order
                resp = await this.client.createAndPostOrder({
                    tokenID: order.tokenId,
                    price: order.price,
                    side: order.side === 'BUY' ? Side.BUY : Side.SELL,
                    size: order.size,
                    feeRateBps: 0,
                    nonce: Date.now(),
                });
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

🆔 *ID:* \`${response.orderId}\`
📊 *Status:* ${response.status}
🪙 *Token:* \`${order.tokenId}\`

🔹 *Side:* ${order.side}
📏 *Size:* ${order.size}
💲 *Price:* ${order.type === 'LIMIT' ? order.price : 'MARKET'}`;

            logger.info(`Order placed: ${JSON.stringify(response)}`);
            if (this.notifier) await this.notifier.notify(successMsg);

        } catch (error: any) {
            logger.error('Failed to execute order:', error);
            if (this.notifier) await this.notifier.notify(`Failed to execute order: ${error.message || error}`);
        }
    }
}
