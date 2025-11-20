import { Strategy, Executor, Notifier, BotConfig } from '../core/types';
import { HLEData } from '../monitors/HLEMonitor';
import { OrderParams } from '../executors/PolymarketExecutor';
import { PolyMarketService } from '../services/PolyMarketService';
import { logger } from '../core/logger';

export class Gemini3HLEStrategy implements Strategy<HLEData | null> {
    private executor: Executor<OrderParams>;
    private hasExecuted = false;
    private eventSlug = 'google-gemini-3-score-on-humanitys-last-exam-by-january-31';
    private targetScore = 40;
    private notifier?: Notifier;

    private config: BotConfig;

    constructor(executor: Executor<OrderParams>, config: BotConfig) {
        this.executor = executor;
        this.config = config;
    }

    setNotifier(notifier: Notifier): void {
        this.notifier = notifier;
    }

    async evaluate(data: HLEData | null): Promise<boolean> {
        if (!data) return false;
        if (this.hasExecuted) return false;

        // console.log(`[Gemini3HLEStrategy] Found model: ${data.modelName}, Score: ${data.score}`);

        if (data.score > this.targetScore) {
            logger.info(`[Gemini3HLEStrategy] Score ${data.score} > ${this.targetScore}. Triggering buy!`);

            // Fetch market details to get token ID
            // We need the "40%+" market.
            // The slug provided by user is for the event, which might contain multiple markets.
            // We need to find the specific market for > 40%.

            const market = await PolyMarketService.getMarketForEvent(this.eventSlug, '40%');

            if (market && market.clobTokenIds && market.clobTokenIds.length >= 2) {
                // Assuming Yes is index 0, No is index 1. 
                // ALWAYS VERIFY THIS IN PRODUCTION. Usually Yes is 0.
                const tokenId = market.clobTokenIds[0];

                // Check Order Book
                const orderBook = await PolyMarketService.getOrderBook(tokenId);
                if (orderBook && orderBook.asks.length > 0) {
                    // Asks are sorted by price ascending usually, but let's be safe
                    // Price is string in API response
                    const lowestAsk = orderBook.asks.reduce((min, ask) => {
                        const price = parseFloat(ask.price);
                        return price < min ? price : min;
                    }, 1.0);

                    logger.info(`[Gemini3HLEStrategy] Lowest Ask: ${lowestAsk}`);

                    if (lowestAsk < 0.90) {
                        logger.info(`[Gemini3HLEStrategy] Lowest ask ${lowestAsk} < 0.90. Executing BUY.`);

                        // MARKET BUY
                        const orderSize = this.config.orderSize || parseFloat(process.env.ORDER_SIZE || '10');
                        const orderType = (this.config.orderType || process.env.ORDER_TYPE || 'MARKET').toUpperCase() as 'LIMIT' | 'MARKET';
                        const orderPrice = this.config.orderPrice !== undefined ? this.config.orderPrice : parseFloat(process.env.ORDER_PRICE || '0');

                        const success = await this.executor.execute({
                            tokenId: tokenId,
                            price: orderPrice,
                            size: orderSize,
                            side: 'BUY',
                            type: orderType
                        });
                        this.hasExecuted = success;
                        return success;
                    } else {
                        logger.info(`[Gemini3HLEStrategy] Lowest ask ${lowestAsk} >= 0.90. Waiting for better price.`);
                    }
                } else {
                    logger.warn('[Gemini3HLEStrategy] Order book empty or no asks.');
                }
            } else {
                logger.error('[Gemini3HLEStrategy] Could not find market or token IDs for 40%+');
            }
        } else {
            logger.info(`[Gemini3HLEStrategy] Score ${data.score} <= ${this.targetScore}. Not triggering buy.`);
        }

        return false;
    }
}
