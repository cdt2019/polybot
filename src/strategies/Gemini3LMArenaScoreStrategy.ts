import { Strategy, Executor, Notifier, BotConfig } from '../core/types';
import { PolyMarketService } from '../services/PolyMarketService';
import { OrderParams } from '../executors/PolymarketExecutor';
import { logger } from '../core/logger';
import { LMArenaResult } from '../monitors/LMArenaTextMonitor';

export class Gemini3LMArenaScoreStrategy implements Strategy<LMArenaResult> {
    private executor: Executor<OrderParams>;
    private notifier?: Notifier;
    private config: BotConfig;
    private eventSlug = 'google-gemini-3-score-on-lmarena-by-december-31';

    // Track executed markets to avoid double betting
    private executedMarkets: Set<string> = new Set();

    constructor(executor: Executor<OrderParams>, config: BotConfig) {
        this.executor = executor;
        this.config = config;
    }

    setNotifier(notifier: Notifier): void {
        this.notifier = notifier;
    }

    async evaluate(data: LMArenaResult): Promise<boolean> {
        if (!data || !data.modelRanks || data.modelRanks.length === 0) {
            logger.info('[Gemini3LMArenaStrategy] No data received from monitor.');
            return false;
        }

        // Find all models starting with 'gemini-3' (case-insensitive)
        const geminiModels = data.modelRanks.filter(m =>
            m.modelName.toLowerCase().startsWith('gemini-3')
        );

        if (geminiModels.length === 0) {
            logger.info('[Gemini3LMArenaStrategy] No Gemini 3 models found in leaderboard.');
            return false;
        }

        // Get the highest score among all Gemini 3 models
        const start = Date.now();
        const maxScore = Math.max(...geminiModels.map(m => m.score));
        logger.info(`[Gemini3LMArenaStrategy] Found Gemini 3 models. Max Score: ${maxScore}`);

        // Define targets based on the user request
        // "1500+" and "1600+" are the expected group Item titles or market names
        const targets = [
            { title: '1600+', threshold: 1600 },
            { title: '1500+', threshold: 1500 }
        ];

        let actionTaken = false;

        // Fetch the event and markets
        // We fetch strictly only if we might need to trade (i.e. we found a Gemini 3 model)
        // This saves API calls if no Gemini 3 is on the board.
        const event = await PolyMarketService.getEventBySlug(this.eventSlug);
        if (!event || !event.markets) {
            logger.error(`[Gemini3LMArenaStrategy] Event not found: ${this.eventSlug}`);
            return false;
        }

        for (const target of targets) {
            // Check condition
            if (maxScore < target.threshold) {
                // Score not high enough for this target
                continue;
            }

            // Find the specific market
            // The user text shows "1500+" as the name. In Polymarket API it fits 'groupItemTitle' usually.
            const market = event.markets.find(m => m.groupItemTitle === target.title);

            if (!market) {
                logger.warn(`[Gemini3LMArenaStrategy] Market for "${target.title}" not found in event.`);
                continue;
            }

            if (this.executedMarkets.has(market.slug)) {
                logger.info(`[Gemini3LMArenaStrategy] Already executed for ${target.title} (${market.slug}).`);
                continue;
            }

            logger.info(`[Gemini3LMArenaStrategy] Condition Met: Max Score ${maxScore} >= ${target.threshold} for ${target.title}. Preparing to Buy YES.`);

            // Execute Buy YES
            const yesIndex = market.outcomes.findIndex(o => o.toLowerCase() === 'yes');
            if (yesIndex === -1) {
                logger.error(`[Gemini3LMArenaStrategy] "Yes" outcome not found for ${target.title}`);
                continue;
            }

            const tokenId = market.clobTokenIds[yesIndex];

            // Order parameters
            // Aggressive buying since the event has happened (score appeared)
            const maxPrice = 0.9;
            const buyAmount = this.config.orderSize || 10; // Default size if not in config

            const success = await this.executor.execute({
                tokenId: tokenId,
                price: maxPrice,
                size: buyAmount,
                side: 'BUY',
                type: 'MARKET', // Use MARKET to fill immediately? Or LIMIT at maxPrice?
                // Strategy guideline: Use FAK with a high limit (effectively market) or just MARKET.
                // Assuming executor handles MARKET type correctly or we pass a limit price.
                // If using MARKET, price might be ignored or treated as 'worst price'. 
                // Using LIMIT with FAK and 0.99 is safer for budget but ensures fill if liquidity exists.
                // User's other strategies use timeInForce: 'FAK'.
                timeInForce: 'FAK',
            });

            if (success) {
                this.executedMarkets.add(market.slug);
                actionTaken = true;
                if (this.notifier) {
                    await this.notifier.notify(`[Gemini3LMArenaStrategy] BOOM! Gemini 3 Score ${maxScore}. Measured ${target.title}. Bought YES.`);
                }
                logger.info(`[Gemini3LMArenaStrategy] Trade executed for ${target.title}.`);
                break;  // Only buy one market, because high score have price lower than lower score
            }
        }

        return actionTaken;
    }
}
