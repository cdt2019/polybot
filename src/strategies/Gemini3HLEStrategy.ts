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

        // Determine which market to buy based on score
        let targetMarket = '';
        let targetThreshold = 0;

        if (data.score >= 45) {
            targetMarket = '45%';
            targetThreshold = 45;
            logger.info(`[Gemini3HLEStrategy] Score ${data.score} >= 45. Targeting 45% market!`);
        } else if (data.score > this.targetScore) {
            targetMarket = '40%+';
            targetThreshold = this.targetScore;
            logger.info(`[Gemini3HLEStrategy] Score ${data.score} > ${this.targetScore}. Targeting 40%+ market!`);
        } else {
            logger.info(`[Gemini3HLEStrategy] Score ${data.score} <= ${this.targetScore}. Not triggering buy.`);
            return false;
        }

        // Fetch market details to get token ID
        const market = await PolyMarketService.getMarketForEvent(this.eventSlug, targetMarket);

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

                logger.info(`[Gemini3HLEStrategy] ${targetMarket} market - Lowest Ask: ${lowestAsk}`);

                const maxPrice = this.config.orderPrice || 0.9;
                if (lowestAsk < maxPrice) {
                    logger.info(`[Gemini3HLEStrategy] Lowest ask ${lowestAsk} < ${maxPrice}. Executing BUY on ${targetMarket} market.`);

                    // MARKET BUY
                    const orderSize = this.config.orderSize || 10;
                    // const orderType = this.config.orderType || 'MARKET';
                    // const timeInForce = this.config.timeInForce ? orderType == "LIMIT" ? "GTC" : "FAK" : "FAK";

                    const success = await this.executor.execute({
                        tokenId: tokenId,
                        price: maxPrice,
                        size: orderSize,
                        side: 'BUY',
                        type: 'MARKET',
                        timeInForce: "FAK"
                    } as any);
                    this.hasExecuted = success;
                    return success;
                } else {
                    logger.info(`[Gemini3HLEStrategy] Lowest ask ${lowestAsk} >= ${maxPrice}. Waiting for better price.`);
                }
            } else {
                logger.warn(`[Gemini3HLEStrategy] Order book empty or no asks for ${targetMarket} market.`);
            }
        } else {
            logger.error(`[Gemini3HLEStrategy] Could not find market or token IDs for ${targetMarket}`);
        }

        return false;
    }
}
