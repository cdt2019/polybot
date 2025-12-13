import { Strategy, Executor, Notifier, BotConfig } from '../core/types';
import { PolyMarketService } from '../services/PolyMarketService';
import { OrderParams } from '../executors/PolymarketExecutor';
import { logger } from '../core/logger';
import { GoogleTrendsData } from '../monitors/GoogleTrendsMonitor';

export type EventSlug = {
    slug: string;
    rank: number;
}

export class GoogleTrendsStrategy implements Strategy<GoogleTrendsData | null> {
    private executor: Executor<OrderParams>;
    private notifier?: Notifier;
    private config: BotConfig;

    // Event slugs for different categories
    private eventSlugMap: { [key: string]: EventSlug[] } = {
        'Trending > People': [
            { slug: '1-searched-person-on-google-this-year', rank: 1 },
            { slug: '2-searched-person-on-google-this-year', rank: 2 }
        ],
        'Entertainment > Actors': [
            { slug: '1-searched-actor-on-google-this-year', rank: 1 },
        ],
        'Sports > Athletes': [
            { slug: '1-searched-athlete-on-google-this-year', rank: 1 },
        ],
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

        // Collect all trade tasks
        const tradeTasks: Promise<{ success: boolean; categoryKey: string; eventSlug: string; itemName: string }>[] = [];

        // Iterate through all sections and categories
        for (const section of data.sections) {
            for (const category of section.categories) {
                const categoryKey = `${section.section} > ${category.category}`;

                // Get the item
                if (!category.items || category.items.length === 0) {
                    logger.warn(`[GoogleTrendsStrategy] No items in ${categoryKey}`);
                    continue;
                }

                // Check if we have a Polymarket event for this category
                const eventSlugs = this.eventSlugMap[categoryKey];
                if (!eventSlugs || eventSlugs.length === 0) {
                    logger.debug(`[GoogleTrendsStrategy] No event mapping for ${categoryKey}, skipping.`);
                    continue;
                }

                // Create parallel trade tasks for all event slugs
                for (const eventSlug of eventSlugs) {
                    if (this.executedTrades.has(eventSlug.slug)) {
                        logger.info(`[GoogleTrendsStrategy] Already executed trade for ${eventSlug.slug}, skipping.`);
                        continue;
                    }

                    // Get the rank - 1 item
                    const item = category.items[eventSlug.rank - 1];
                    if (!item) {
                        logger.warn(`[GoogleTrendsStrategy] No item found at rank ${eventSlug.rank} for ${categoryKey}`);
                        continue;
                    }

                    logger.info(`[GoogleTrendsStrategy] Queueing trade for ${categoryKey} #${eventSlug.rank}: ${item.name}`);

                    // Add trade task to parallel execution list
                    tradeTasks.push(
                        this.executeTrade(categoryKey, eventSlug.slug, item.name).then(success => ({
                            success,
                            categoryKey,
                            eventSlug: eventSlug.slug,
                            itemName: item.name
                        }))
                    );
                }
            }
        }

        if (tradeTasks.length === 0) {
            logger.info('[GoogleTrendsStrategy] No trades to execute.');
            return false;
        }

        logger.info(`[GoogleTrendsStrategy] Executing ${tradeTasks.length} trades in parallel...`);

        // Execute all trades in parallel
        const results = await Promise.all(tradeTasks);

        // Check if all trades succeeded
        const allSucceeded = results.every(r => r.success);
        const successCount = results.filter(r => r.success).length;

        logger.info(`[GoogleTrendsStrategy] Trade results: ${successCount}/${results.length} succeeded`);

        // Mark successful trades as executed
        for (const result of results) {
            if (result.success) {
                this.executedTrades.add(result.eventSlug);
                logger.info(`[GoogleTrendsStrategy] ✓ Trade successful: ${result.itemName} (${result.categoryKey})`);
            } else {
                logger.error(`[GoogleTrendsStrategy] ✗ Trade failed: ${result.itemName} (${result.categoryKey})`);
            }
        }

        // Only return true if ALL trades succeeded
        if (allSucceeded) {
            logger.info('[GoogleTrendsStrategy] ✓ All trades executed successfully!');
        } else {
            logger.warn('[GoogleTrendsStrategy] ✗ Some trades failed. evaluate() returning false.');
        }

        return allSucceeded;
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
                logger.warn(`[GoogleTrendsStrategy] No market found for "${itemName}" in event ${eventSlug}, skip trade`);
                if (this.notifier) {
                    await this.notifier.notify(`[GoogleTrendsStrategy] No market found for "${itemName}" in event ${eventSlug}, skip trade`);
                }
                //no market found , return true avoid trade of slug always executed     
                return true;
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
            let maxPrice = this.config.orderPrice || 0.9; // Default cap
            if (orderBook && orderBook.asks.length > 0) {
                const lowestAsk = parseFloat(orderBook.asks[0].price);
                logger.info(`[GoogleTrendsStrategy] Lowest ask for ${itemName}: ${lowestAsk}`);
            }

            const orderSize = this.config.orderSize || 10;

            logger.info(`[GoogleTrendsStrategy] Executing BUY YES for ${itemName} on market ${market.slug}`);

            const success = await this.executor.execute({
                tokenId: tokenId,
                price: maxPrice,
                size: orderSize,
                side: 'BUY',
                type: 'MARKET',
                timeInForce: 'FAK',
            });

            if (success) {
                if (this.notifier) {
                    await this.notifier.notify(`Sniper Triggered! Bought YES for ${itemName} (${categoryKey})`);
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
