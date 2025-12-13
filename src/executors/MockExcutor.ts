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

export class MockExecutor implements Executor<OrderParams> {
    private notifier?: Notifier;


    constructor(privateKey: string, notifier?: Notifier, chainId: number = 137) {
        this.notifier = notifier;
    }


    public async execute(order: OrderParams): Promise<boolean> {
        const msg = `Executing ${order.type} order: ${order.side} ${order.size} of ${order.tokenId} at ${order.type === 'LIMIT' ? order.price : 'MARKET'}`;
        logger.info(msg);
        if (this.notifier) await this.notifier.notify(msg);

        try {
            // Mock Response
            let resp = {
                success: true,
                orderID: Math.random().toString(36).substring(2, 15),
                status: 'Filled',
            };

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
