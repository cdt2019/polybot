import { Strategy, Executor, Notifier, BotConfig } from '../core/types';
import { PolyMarketService } from '../services/PolyMarketService';
import { OrderParams } from '../executors/PolymarketExecutor';
import { logger } from '../core/logger';
import { GoogleTrendsData } from '../monitors/GoogleTrendsMonitor';

export class GoogleTrendsStrategy implements Strategy<GoogleTrendsData | null> {
    private executor: Executor<OrderParams>;
    private notifier?: Notifier;
    private config: BotConfig;

    // Event slugs for different categories
    private eventSlugMap: { [key: string]: string } = {
        'Trending > People': '1-searched-person-on-google-this-year',
        // Add more event slugs as needed for other categories
        // 'Entertainment > Movies': 'top-movie-2024',
        // 'Sports > Athletes': 'top-athlete-2024',
    };

    private executedTrades: Set<string> = new Set();

    constructor(executor: Executor<OrderParams>, config: BotConfig) {
        this.executor = executor;
        this.config = config;
    }

    setNotifier(notifier: Notifier): void {
        this.notifier = notifier;
    }

    async evaluate(data: GoogleTrendsData | null): Promise<boolean> {
        if (!data || data.sections.length === 0) {
            logger.info('[GoogleTrendsStrategy] No data to evaluate.');
            return false;
        }

        logger.info(`[GoogleTrendsStrategy] Evaluating ${data.sections.length} sections...`);

        let anyTradeExecuted = false;

        // Iterate through all sections and categories
        for (const section of data.sections) {
            for (const category of section.categories) {
                const categoryKey = `${section.section} > ${category.category}`;

                // Check if we have a Polymarket event for this category
                const eventSlug = this.eventSlugMap[categoryKey];
                if (!eventSlug) {
                    logger.debug(`[GoogleTrendsStrategy] No event mapping for ${categoryKey}, skipping.`);
                    continue;
                }

                // Check if we already executed a trade for this category
                if (this.executedTrades.has(categoryKey)) {
                    logger.info(`[GoogleTrendsStrategy] Already executed trade for ${categoryKey}, skipping.`);
                    continue;
                }

                // Get the top item
                if (category.items.length === 0) {
                    logger.warn(`[GoogleTrendsStrategy] No items in ${categoryKey}`);
                    continue;
                }

                const topItem = category.items[0];
                logger.info(`[GoogleTrendsStrategy] ${categoryKey} #1: ${topItem.name}`);

                // Try to execute trade for this item
                const success = await this.executeTrade(categoryKey, eventSlug, topItem.name);
                if (success) {
                    this.executedTrades.add(categoryKey);
                    anyTradeExecuted = true;
                }
            }
        }

        return anyTradeExecuted;
    }

    private async executeTrade(categoryKey: string, eventSlug: string, itemName: string): Promise<boolean> {
        try {
            logger.info(`[GoogleTrendsStrategy] Attempting trade for ${categoryKey}: ${itemName}`);

            // Fetch the event
            const event = await PolyMarketService.getEventBySlug(eventSlug);
            if (!event || !event.markets) {
                logger.error(`[GoogleTrendsStrategy] Event not found: ${eventSlug}`);
                return false;
            }

            // Find the market that matches the item
            const market = event.markets.find(m => {
                return m.question.includes(itemName) || m.groupItemTitle === itemName;
            });

            if (!market) {
                logger.warn(`[GoogleTrendsStrategy] No market found for "${itemName}" in event ${eventSlug}`);
                return false;
            }

            logger.info(`[GoogleTrendsStrategy] Found market for ${itemName}: ${market.slug}`);

            // Find YES outcome
            const yesIndex = market.outcomes.findIndex(o => o.toLowerCase() === 'yes');
            if (yesIndex === -1) {
                logger.error(`[GoogleTrendsStrategy] "Yes" outcome not found for ${market.slug}`);
                return false;
            }

            const tokenId = market.clobTokenIds[yesIndex];

            // Check order book
            const orderBook = await PolyMarketService.getOrderBook(tokenId);
            let price = 0.9; // Default cap
            if (orderBook && orderBook.asks.length > 0) {
                const lowestAsk = parseFloat(orderBook.asks[0].price);
                logger.info(`[GoogleTrendsStrategy] Lowest ask for ${itemName}: ${lowestAsk}`);
            }

            const orderSize = this.config.orderSize || 10;

            logger.info(`[GoogleTrendsStrategy] Executing BUY YES for ${itemName} on market ${market.slug}`);

            const success = await this.executor.execute({
                tokenId: tokenId,
                price: price,
                size: orderSize,
                side: 'BUY',
                type: 'LIMIT'
            });

            if (success) {
                if (this.notifier) {
                    await this.notifier.notify(`Sniper Triggered! Bought YES for ${itemName} (${categoryKey} #1)`);
                }
                return true;
            }

            return false;
        } catch (error) {
            logger.error(`[GoogleTrendsStrategy] Error executing trade for ${categoryKey}:`, error);
            return false;
        }
    }
}
