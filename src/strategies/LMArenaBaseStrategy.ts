import { Strategy, Executor, Notifier, BotConfig } from '../core/types';
import { PolyMarketService } from '../services/PolyMarketService';
import { OrderParams } from '../executors/PolymarketExecutor';
import { logger } from '../core/logger';
import { LMArenaResult, LMArenaData } from '../monitors/LMArenaTextMonitor';

interface RankState {
    company: string;
    modelName: string;
    score: number;
    organization: string;
}

interface EventSlugs {
    rank1: string;
    rank2: string;
    rank3: string;
}

interface EventPeriod {
    endDate: Date;           // 截止时间 (ET timezone)
    slugs: EventSlugs;
    label: string;           // e.g., "December 2025", "January 2026"
}

interface TradeRecord {
    leaderboardVersion: string;  // lastUpdated from leaderboard
    executedAt: Date;
    side: 'YES' | 'NO';
    price: number;
    amount: number;
}

// Mapping: lowercase model substring -> Company Name (Polymarket Outcome)
const COMPANY_MAP: Record<string, string> = {
    'claude': 'Anthropic',
    'gpt': 'OpenAI',
    'gemini': 'Google',
    'grok': 'xAI',
    'kimi': 'Moonshot',
    'mistral': 'Mistral',
    'codestral': 'Mistral',
    'devstral': 'Mistral',
    'deepseek': 'DeepSeek',
    'qwen': 'Alibaba',
    'llama': 'Meta',
    'glm': 'Z.ai',
    'longcat': 'Meituan',
    'ernie': 'Baidu',
    'hunyuan': 'Tencent',
    'mai': 'Microsoft'
};


export abstract class LMArenaBaseStrategy implements Strategy<LMArenaResult> {
    protected executor: Executor<OrderParams>;
    protected notifier?: Notifier;
    protected config: BotConfig;

    // Track rank states for positions 1, 2, 3
    protected rankStates: (RankState | null)[] = [null, null, null];
    // Track all known models
    protected knownModels: Set<string> = new Set();

    // Enhanced trade tracking: Map<"eventSlug:company:side", TradeRecord>
    protected executedTrades: Map<string, TradeRecord> = new Map();

    // Track last seen leaderboard version
    protected lastSeenLeaderboardVersion: string = '';

    protected initialized = false;

    // Track consecutive validation failures
    protected validationFailureCount = 0;
    protected readonly MAX_VALIDATION_FAILURES = 5;

    constructor(executor: Executor<OrderParams>, config: BotConfig) {
        this.executor = executor;
        this.config = config;
    }

    setNotifier(notifier: Notifier): void {
        this.notifier = notifier;
    }

    // Abstract methods to be implemented by subclasses
    abstract getEventPeriods(): EventPeriod[];
    abstract getStrategyName(): string;
    abstract getLeaderboardType(): string;

    /**
     * Get current active event slugs based on current time
     */
    protected getCurrentEventPeriod(): EventPeriod | null {
        const now = new Date();
        const periods = this.getEventPeriods();

        // Find the first period that hasn't ended yet
        for (const period of periods) {
            if (now < period.endDate) {
                return period;
            }
        }

        // All periods have ended
        logger.warn(`[${this.getStrategyName()}] All event periods have ended!`);
        return null;
    }

    protected getRankEventSlug(rank: number): string | null {
        const period = this.getCurrentEventPeriod();
        if (!period) return null;

        switch (rank) {
            case 1: return period.slugs.rank1;
            case 2: return period.slugs.rank2;
            case 3: return period.slugs.rank3;
            default: return null;
        }
    }

    protected getCompanyByModelName(modelName: string): string | null {
        if (!modelName) return null;

        for (const [key, company] of Object.entries(COMPANY_MAP)) {
            if (modelName.toLowerCase().startsWith(key)) {
                return company;
            }
        }

        logger.warn(`[${this.getStrategyName()}] Unknown model: ${modelName}`);
        return null;
    }

    /**
     * Generate a unique trade key for tracking
     */
    protected getTradeKey(eventSlug: string, company: string, side: 'YES' | 'NO'): string {
        return `${eventSlug}:${company}:${side}`;
    }

    /**
     * Check if a trade should be allowed
     * - If leaderboard has updated since last trade, allow re-trading
     * - If same leaderboard version, don't duplicate
     */
    protected shouldAllowTrade(
        eventSlug: string,
        company: string,
        side: 'YES' | 'NO',
        currentLeaderboardVersion: string
    ): boolean {
        const tradeKey = this.getTradeKey(eventSlug, company, side);
        const existingTrade = this.executedTrades.get(tradeKey);

        if (!existingTrade) {
            // Never traded this combination
            return true;
        }

        // Check if leaderboard has been updated since the trade
        if (existingTrade.leaderboardVersion !== currentLeaderboardVersion) {
            logger.info(
                `[${this.getStrategyName()}] Leaderboard updated since last trade for ${company} ${side}. ` +
                `Previous: ${existingTrade.leaderboardVersion}, Current: ${currentLeaderboardVersion}. Allowing re-trade.`
            );
            return true;
        }

        // Same leaderboard version, don't duplicate
        return false;
    }

    /**
     * Validate lastUpdated format
     * Expected formats:
     * - "Dec 17, 2025"
     * - "December 17, 2025"
     * - "Jan 1, 2026"
     * - "2025-12-17" (ISO format)
     */
    protected validateLastUpdated(lastUpdated: string): boolean {
        if (!lastUpdated || typeof lastUpdated !== 'string') {
            return false;
        }

        const trimmed = lastUpdated.trim();

        if (trimmed.length === 0) {
            return false;
        }

        // Pattern 1: "Dec 17, 2025" or "December 17, 2025"
        const pattern1 = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}, \d{4}$/i;

        // Pattern 2: ISO format "2025-12-17"
        const pattern2 = /^\d{4}-\d{2}-\d{2}$/;

        // Pattern 3: "17 Dec 2025" or "17 December 2025"
        const pattern3 = /^\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}$/i;

        // Pattern 4: "12/17/2025" or "17/12/2025"
        const pattern4 = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

        const matchesPattern = pattern1.test(trimmed) ||
            pattern2.test(trimmed) ||
            pattern3.test(trimmed) ||
            pattern4.test(trimmed);

        if (!matchesPattern) {
            return false;
        }

        // Try to parse and validate the date
        try {
            const parsed = new Date(trimmed);

            if (isNaN(parsed.getTime())) {
                return false;
            }

            // Sanity check: date should be reasonable
            const now = new Date();
            const minDate = new Date('2025-01-01');
            //const maxDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // +1 year

            return parsed >= minDate;
        } catch {
            return false;
        }
    }

    /**
     * Normalize lastUpdated to a consistent format for comparison
     */
    protected normalizeLeaderboardVersion(lastUpdated: string): string {
        try {
            const parsed = new Date(lastUpdated.trim());
            if (!isNaN(parsed.getTime())) {
                // Return ISO date string (YYYY-MM-DD) for consistent comparison
                return parsed.toISOString().split('T')[0];
            }
        } catch {
            // ignore
        }
        // Fallback: return trimmed original
        return lastUpdated.trim();
    }

    async evaluate(data: LMArenaResult | null): Promise<boolean> {
        const strategyName = this.getStrategyName();
        // Check if data exists
        if (!data) {
            logger.warn(`[${strategyName}] No data received (null).`);
            return false;
        }

        // Check if modelRanks exists and has data
        if (!data.modelRanks || data.modelRanks.length === 0) {
            logger.warn(`[${strategyName}] No model ranks in data.`);
            return false;
        }

        // Validate lastUpdated format
        if (!this.validateLastUpdated(data.lastUpdated)) {
            this.validationFailureCount++;

            logger.warn(
                `[${strategyName}] ?? Invalid lastUpdated format: "${data.lastUpdated}". ` +
                `Skipping this poll. (Failure ${this.validationFailureCount}/${this.MAX_VALIDATION_FAILURES})`
            );

            // Alert if too many consecutive failures
            if (this.validationFailureCount >= this.MAX_VALIDATION_FAILURES) {
                const alertMsg =
                    `[${strategyName}] ?? ALERT: ${this.validationFailureCount} consecutive validation failures!\n` +
                    `Last received lastUpdated: "${data.lastUpdated}"\n` +
                    `Please check the monitor/scraper.`;

                logger.error(alertMsg);

                if (this.notifier) {
                    await this.notifier.notify(alertMsg);
                }

                // true for Exit Bot
                return true;
            }

            // false for Next try
            return false;
        }

        // Validation passed, reset failure counter
        this.validationFailureCount = 0;

        // Check current event period
        const currentPeriod = this.getCurrentEventPeriod();
        if (!currentPeriod) {
            logger.error(`[${strategyName}] No active event period. All markets have ended.`);
            return false;
        }

        const leaderboardVersion = data.lastUpdated;
        const isNewLeaderboardVersion = leaderboardVersion !== this.lastSeenLeaderboardVersion;

        if (isNewLeaderboardVersion && this.lastSeenLeaderboardVersion !== '') {
            logger.info(
                `[${strategyName}] 📊 LEADERBOARD UPDATED! ` +
                `${this.lastSeenLeaderboardVersion} -> ${leaderboardVersion}`
            );

            if (this.notifier) {
                this.notifier.notify(
                    `[${strategyName}] 📊 Leaderboard Updated!\n` +
                    `Version: ${leaderboardVersion}\n` +
                    `Total Votes: ${data.totalVotes.toLocaleString()}\n` +
                    `Total Models: ${data.totalModels}`
                );
            }
        }

        logger.info(
            `[${strategyName}] Evaluating ${data.modelRanks.length} models.\n` +
            `  Last Updated: ${leaderboardVersion}\n` +
            `  Active Period: ${currentPeriod.label} (ends ${currentPeriod.endDate.toISOString()})`
        );

        // Get top 3 models (already sorted by rank from monitor)
        const top3 = data.modelRanks.filter(m => m.rank >= 1 && m.rank <= 3).slice(0, 3);

        // Fallback: if rank field is not reliable, use first 3
        const effectiveTop3 = top3.length === 3 ? top3 : data.modelRanks.slice(0, 3);

        // INITIALIZATION PHASE
        if (!this.initialized) {
            this.lastSeenLeaderboardVersion = leaderboardVersion;
            return this.initialize(effectiveTop3, data.modelRanks);
        }

        let actionTaken = false;

        // PHASE 1: Find new models (for logging/notifications)
        for (const model of data.modelRanks) {
            if (!this.knownModels.has(model.modelName)) {
                const company = this.getCompanyByModelName(model.modelName);
                logger.info(
                    `[${strategyName}] 🆕 NEW MODEL: ${model.modelName} ` +
                    `(${company || 'Unknown'}) Score: ${model.score}, Rank: ${model.rank}`
                );

                this.knownModels.add(model.modelName);
            }
        }

        // PHASE 2: Detect rank changes in top 3
        for (let i = 0; i < effectiveTop3.length; i++) {
            const currentModel = effectiveTop3[i];
            const rankPosition = i + 1;
            const currentCompany = this.getCompanyByModelName(currentModel.modelName);
            const previousState = this.rankStates[i];

            if (!currentCompany) {
                logger.warn(`[${strategyName}] Could not determine company for model: ${currentModel.modelName}`);
                continue;
            }

            const eventSlug = this.getRankEventSlug(rankPosition);
            if (!eventSlug) {
                continue;
            }

            if (previousState && previousState.company !== 'Unknown') {
                if (currentCompany !== previousState.company) {
                    // RANK CHANGED - Different company now holds this position
                    logger.info(
                        `[${strategyName}] 🔄 RANK #${rankPosition} CHANGE: ` +
                        `${previousState.company} (${previousState.modelName}) -> ` +
                        `${currentCompany} (${currentModel.modelName})`
                    );

                    if (this.notifier) {
                        this.notifier.notify(
                            `[${strategyName}] 🔄 RANK CHANGE!\n` +
                            `Position: #${rankPosition}\n` +
                            `Previous: ${previousState.company} (${previousState.modelName})\n` +
                            `New: ${currentCompany} (${currentModel.modelName})\n` +
                            `Score: ${currentModel.score}\n` +
                            `Period: ${currentPeriod.label}`
                        );
                    }

                    // Execute BUY YES for the new rank holder
                    await this.executeBuy(
                        currentCompany,
                        eventSlug,
                        'YES',
                        leaderboardVersion,
                        `Rank #${rankPosition} Change: ${currentCompany} took position from ${previousState.company}`
                    );

                    // Execute BUY NO for the previous rank holder (they lost the position)
                    await this.executeBuy(
                        previousState.company,
                        eventSlug,
                        'NO',
                        leaderboardVersion,
                        `Rank #${rankPosition} Change: ${previousState.company} lost position to ${currentCompany}`
                    );

                } else if (currentModel.score !== previousState.score) {
                    // Same company, score changed - just log
                    const direction = currentModel.score > previousState.score ? '📈' : '📉';
                    logger.info(
                        `[${strategyName}] ${direction} Score change for ${currentCompany} at Rank #${rankPosition}: ` +
                        `${previousState.score} -> ${currentModel.score} (${currentModel.modelName})`
                    );
                }
            } else if (!previousState || previousState.company === 'Unknown') {
                // First time seeing this rank position properly
                logger.info(
                    `[${strategyName}] 📍 Rank #${rankPosition}: ${currentCompany} (${currentModel.modelName}), Score: ${currentModel.score}`
                );
            }
        }

        // UPDATE STATE
        this.updateRankStates(effectiveTop3);
        this.lastSeenLeaderboardVersion = leaderboardVersion;

        // Add all models to known set
        data.modelRanks.forEach(m => this.knownModels.add(m.modelName));

        // If no active event period, return true to exit bot
        if (this.getCurrentEventPeriod() == null) {
            logger.info(`[${strategyName}] No active event period found. Exit bot.`);
            actionTaken = true;
        }
        return actionTaken;
    }

    protected initialize(top3: LMArenaData[], allModels: LMArenaData[]): boolean {
        const strategyName = this.getStrategyName();
        const currentPeriod = this.getCurrentEventPeriod();

        for (let i = 0; i < 3; i++) {
            const model = top3[i];
            if (model) {
                const company = this.getCompanyByModelName(model.modelName);
                this.rankStates[i] = {
                    company: company || 'Unknown',
                    modelName: model.modelName,
                    score: model.score,
                    organization: model.organization
                };
            }
        }

        // Populate all known models
        allModels.forEach(m => this.knownModels.add(m.modelName));

        this.initialized = true;

        const initMsg =
            `[${strategyName}] ✅ Initialized!\n` +
            `  Leaderboard: ${this.getLeaderboardType()}\n` +
            `  Active Period: ${currentPeriod?.label || 'None'}\n` +
            `  Rank #1: ${this.rankStates[0]?.company} (${this.rankStates[0]?.modelName}) - ${this.rankStates[0]?.score}\n` +
            `  Rank #2: ${this.rankStates[1]?.company} (${this.rankStates[1]?.modelName}) - ${this.rankStates[1]?.score}\n` +
            `  Rank #3: ${this.rankStates[2]?.company} (${this.rankStates[2]?.modelName}) - ${this.rankStates[2]?.score}\n` +
            `  Known Models: ${this.knownModels.size}`;

        logger.info(initMsg);

        if (this.notifier) {
            this.notifier.notify(initMsg);
        }

        return false;
    }

    protected updateRankStates(top3: LMArenaData[]): void {
        for (let i = 0; i < 3; i++) {
            const model = top3[i];
            if (model) {
                const company = this.getCompanyByModelName(model.modelName);
                this.rankStates[i] = {
                    company: company || 'Unknown',
                    modelName: model.modelName,
                    score: model.score,
                    organization: model.organization
                };
            }
        }
    }

    protected async executeBuy(
        company: string,
        eventSlug: string,
        side: 'YES' | 'NO',
        leaderboardVersion: string,
        reason: string
    ): Promise<boolean> {
        const strategyName = this.getStrategyName();

        // Check if trade should be allowed
        if (!this.shouldAllowTrade(eventSlug, company, side, leaderboardVersion)) {
            logger.info(
                `[${strategyName}] Trade already executed for ${company} ${side} on this leaderboard version. Skipping.`
            );
            return false;
        }

        logger.info(`[${strategyName}] 🎯 Executing BUY ${side} for ${company} in ${eventSlug}. Reason: ${reason}`);

        try {
            // Fetch the event
            const event = await PolyMarketService.getEventBySlug(eventSlug);
            if (!event || !event.markets) {
                logger.error(`[${strategyName}] Event not found: ${eventSlug}`);
                return false;
            }

            // Find the market for this company
            const market = event.markets.find(m =>
                m.groupItemTitle === company ||
                m.question?.includes(company)
            );

            if (!market) {
                logger.warn(
                    `[${strategyName}] Market for "${company}" not found in event ${eventSlug}. ` +
                    `Available: ${event.markets.map(m => m.groupItemTitle).join(', ')}`
                );
                return false;
            }

            // Check if market is still open
            // if (market.closed) {
            //     logger.warn(`[${strategyName}] Market for ${company} is closed.`);
            //     return false;
            // }

            // Find YES or NO token
            const outcomeIndex = market.outcomes.findIndex(o => o.toLowerCase() === side.toLowerCase());
            if (outcomeIndex === -1) {
                logger.error(`[${strategyName}] ${side} outcome not found for ${company}`);
                return false;
            }

            const tokenId = market.clobTokenIds[outcomeIndex];

            // Check order book for price
            const orderBook = await PolyMarketService.getOrderBook(tokenId);
            if (!orderBook || orderBook.asks.length === 0) {
                logger.warn(`[${strategyName}] No ASKs available for ${company} ${side}`);
                return false;
            }

            // Find lowest ask
            const lowestAsk = orderBook.asks.reduce((min, ask) => {
                const price = parseFloat(ask.price);
                return price < min ? price : min;
            }, 1.0);

            logger.info(`[${strategyName}] ${company} ${side} - Lowest Ask: ${lowestAsk}`);

            // Check price limit
            const maxPrice = this.config.orderPrice || 0.9;
            if (lowestAsk >= maxPrice) {
                logger.info(`[${strategyName}] Price ${lowestAsk} >= ${maxPrice}. Too expensive, skipping.`);
                return false;
            }

            // Execute the buy
            const buyAmount = this.config.orderSize || 10;
            logger.info(`[${strategyName}] 💰 MARKET BUY ${side}: ${company} @ ${lowestAsk}, Size: $${buyAmount}`);

            const success = await this.executor.execute({
                tokenId: tokenId,
                price: maxPrice,
                size: buyAmount,
                side: 'BUY',
                type: 'MARKET',
                timeInForce: 'FAK',
            });

            if (success) {
                // Record the trade
                const tradeKey = this.getTradeKey(eventSlug, company, side);
                this.executedTrades.set(tradeKey, {
                    leaderboardVersion: leaderboardVersion,
                    executedAt: new Date(),
                    side: side,
                    price: lowestAsk,
                    amount: buyAmount
                });

                const successMsg =
                    `[${strategyName}] ✅ TRADE EXECUTED!\n` +
                    `Company: ${company}\n` +
                    `Side: ${side}\n` +
                    `Price: ${lowestAsk}\n` +
                    `Amount: $${buyAmount}\n` +
                    `Leaderboard: ${leaderboardVersion}\n` +
                    `Reason: ${reason}`;

                logger.info(successMsg);

                if (this.notifier) {
                    this.notifier.notify(successMsg);
                }

                return true;
            } else {
                logger.error(`[${strategyName}] ❌ Order execution failed for ${side} ${company}`);
                return false;
            }

        } catch (error) {
            logger.error(`[${strategyName}] Error executing buy for ${side} ${company}:`, error);
            return false;
        }
    }

    /**
     * Get current state summary for debugging
     */
    public getStateSummary(): object {
        const currentPeriod = this.getCurrentEventPeriod();

        return {
            strategyName: this.getStrategyName(),
            leaderboardType: this.getLeaderboardType(),
            initialized: this.initialized,
            lastSeenLeaderboardVersion: this.lastSeenLeaderboardVersion,
            currentEventPeriod: currentPeriod ? {
                label: currentPeriod.label,
                endDate: currentPeriod.endDate.toISOString(),
                slugs: currentPeriod.slugs
            } : null,
            rankStates: this.rankStates,
            knownModelsCount: this.knownModels.size,
            executedTradesCount: this.executedTrades.size,
            executedTrades: Object.fromEntries(
                Array.from(this.executedTrades.entries()).map(([k, v]) => [k, {
                    ...v,
                    executedAt: v.executedAt.toISOString()
                }])
            )
        };
    }

    /**
     * Force reset the strategy state (useful for testing or manual intervention)
     */
    public reset(): void {
        this.initialized = false;
        this.rankStates = [null, null, null];
        this.knownModels.clear();
        this.executedTrades.clear();
        this.lastSeenLeaderboardVersion = '';
        logger.info(`[${this.getStrategyName()}] Strategy state reset.`);
    }
}