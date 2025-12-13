import { Strategy, Executor, Notifier, BotConfig } from '../core/types';
import { PolyMarketService } from '../services/PolyMarketService';
import { OrderParams } from '../executors/PolymarketExecutor';
import { logger } from '../core/logger';

export class Gemini3FlashStrategy implements Strategy<boolean> {
    private executor: Executor<OrderParams>;
    private notifier?: Notifier;
    private config: BotConfig;
    private eventSlug = 'gemini-3pt0-flash-released-by-december-31';

    // Track executed markets to avoid double betting in the same run/session
    // Key: market slug or question
    private executedMarkets: Set<string> = new Set();

    constructor(executor: Executor<OrderParams>, config: BotConfig) {
        this.executor = executor;
        this.config = config;
    }

    setNotifier(notifier: Notifier): void {
        this.notifier = notifier;
    }

    async evaluate(isReleased: boolean): Promise<boolean> {
        if (!isReleased) {
            return false;
        }

        logger.info('[Gemini3FlashStrategy] Model is released! Evaluating markets...');

        // Fetch the main event which contains all related markets
        const event = await PolyMarketService.getEventBySlug(this.eventSlug);
        if (!event || !event.markets) {
            logger.error(`[Gemini3FlashStrategy] Event not found: ${this.eventSlug}`);
            return false;
        }

        const now = new Date();
        let actionTaken = false;

        const targets = [
            { title: 'December 15', deadline: new Date('2025-12-15T23:59:00-05:00') },
            { title: 'December 18', deadline: new Date('2025-12-18T23:59:00-05:00') },
            { title: 'December 22', deadline: new Date('2025-12-22T23:59:00-05:00') },
            { title: 'December 31', deadline: new Date('2025-12-31T23:59:00-05:00') }
        ];

        for (const target of targets) {
            // Find the specific market
            const market = event.markets.find(m => m.groupItemTitle === target.title);

            if (!market) {
                logger.warn(`[Gemini3FlashStrategy] Market for "${target.title}" not found in event.`);
                continue;
            }

            if (this.executedMarkets.has(market.slug)) {
                logger.info(`[Gemini3FlashStrategy] Already executed for ${target.title} (${market.slug}).`);
                continue;
            }

            // Check if we are still before the deadline
            if (now > target.deadline) {
                logger.info(`[Gemini3FlashStrategy] Deadline passed for ${target.title}.`);
                continue;
            }

            // Check price and execute
            // We want to buy YES if price < 0.90
            // Assuming YES is index 0
            const yesIndex = market.outcomes.findIndex(o => o.toLowerCase() === 'yes');
            if (yesIndex === -1) {
                logger.error(`[Gemini3FlashStrategy] "Yes" outcome not found for ${target.title}`);
                continue;
            }

            const tokenId = market.clobTokenIds[yesIndex];

            // Check Order Book for price
            const orderBook = await PolyMarketService.getOrderBook(tokenId);
            if (orderBook && orderBook.asks.length > 0) {
                const lowestAsk = orderBook.asks.reduce((min, ask) => {
                    const price = parseFloat(ask.price);
                    return price < min ? price : min;
                }, 1.0);

                logger.info(`[Gemini3FlashStrategy] ${target.title} - Lowest Ask: ${lowestAsk}`);

                const maxPrice = this.config.orderPrice || 0.9; // Limit price to ensure we don't pay more than 0.90
                if (lowestAsk < maxPrice) {
                    logger.info(`[Gemini3FlashStrategy] Price ${lowestAsk} < ${maxPrice} for ${target.title}. Executing BUY.`);

                    const buyAmount = this.config.orderSize || 10;

                    const success = await this.executor.execute({
                        tokenId: tokenId,
                        price: maxPrice,
                        size: buyAmount,
                        side: 'BUY',
                        type: 'MARKET',
                        timeInForce: 'FAK',
                    });

                    if (success) {
                        this.executedMarkets.add(market.slug);
                        actionTaken = true;
                        if (this.notifier) {
                            await this.notifier.notify(`Bought Yes for ${target.title} at ${maxPrice}`);
                        }
                        // Optimization: Buy only one (the earliest/best) market and stop.
                        // Since targets are sorted by date (implicitly or explicitly), the first one we buy is the best.
                        logger.info('[Gemini3FlashStrategy] Executed one trade. Stopping further execution for this poll.');
                        break;
                    }
                } else {
                    logger.info(`[Gemini3FlashStrategy] Price ${lowestAsk} >= ${maxPrice} for ${target.title}. Skipping.`);
                }
            } else {
                logger.warn(`[Gemini3FlashStrategy] No asks found for ${target.title}`);
            }
        }

        return actionTaken;
    }
}
