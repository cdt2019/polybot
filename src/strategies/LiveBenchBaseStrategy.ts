import { Strategy, Executor, Notifier, BotConfig } from '../core/types';
import { PolyMarketService } from '../services/PolyMarketService';
import { OrderParams } from '../executors/PolymarketExecutor';
import { logger } from '../core/logger';
import { LiveBenchData } from '../monitors/LiveBenchMonitor';

export abstract class LiveBenchBaseStrategy implements Strategy<LiveBenchData[]> {
    protected executor: Executor<OrderParams>;
    protected notifier?: Notifier;
    protected config: BotConfig;

    // Mapping: lowercase model substring -> Company Name (Polymarket Outcome)
    private companyMap: Record<string, string> = {
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
        'glm': 'Z.ai'
    };

    // Significant patterns (Regex) for "Defense" buy triggers
    private significantPatterns: RegExp[] = [
        ///gpt-5.2-codex/i,
        ///gemini-3(.0)?-flash/i,
        // /grok-4-2/i,
    ];

    // Track known models
    protected knownModels: Set<string> = new Set();
    // Track the current leader info
    protected currentLeaderCompany: string | null = null;
    protected currentLeaderScore: number = 0;

    constructor(executor: Executor<OrderParams>, config: BotConfig) {
        this.executor = executor;
        this.config = config;
    }

    setNotifier(notifier: Notifier): void {
        this.notifier = notifier;
    }

    // Abstract methods to be implemented by child strategies
    abstract getStrategyName(): string;
    abstract getEventSlug(): string;
    abstract getScore(model: LiveBenchData): number;

    protected getCompany(modelName: string): string | null {
        const lowerName = modelName.toLowerCase();
        for (const [key, company] of Object.entries(this.companyMap)) {
            if (lowerName.includes(key)) {
                return company;
            }
        }
        return null;
    }

    protected isSignificant(modelName: string): boolean {
        return this.significantPatterns.some(regex => regex.test(modelName));
    }

    async evaluate(data: LiveBenchData[] | null): Promise<boolean> {
        if (!data || data.length === 0) {
            return false;
        }

        const strategyName = this.getStrategyName();

        // sort by specific metric score
        data = data.sort((a, b) => this.getScore(b) - this.getScore(a));

        // 1. Identify current top model in this poll
        const topModel = data[0];
        const topModelScore = this.getScore(topModel);
        const topCompany = this.getCompany(topModel.modelName);

        if (!topCompany) {
            logger.warn(`[${strategyName}] Could not map top model "${topModel.modelName}" to a known company.`);
        }

        let actionTaken = false;

        // 2. Initialize Leader State if first run
        if (this.currentLeaderCompany === null) {
            if (topCompany) {
                this.currentLeaderCompany = topCompany;
                this.currentLeaderScore = topModelScore;
                // Populate all initial known models
                data.forEach(m => this.knownModels.add(m.modelName));
                logger.info(`[${strategyName}] Initialized. Leader: ${this.currentLeaderCompany} (${topModelScore}). Known Models: ${this.knownModels.size}`);
            }
            return false;
        }

        // 3. Scan for NEW models (Logging & Defense Logic)
        for (const model of data) {
            if (!this.knownModels.has(model.modelName)) {
                const modelScore = this.getScore(model);

                // FOUND A NEW ENTRANT
                logger.info(`[${strategyName}] 🚨 NEW MODEL DETECTED: ${model.modelName} (Score: ${modelScore})`);

                // Add to known set immediately
                this.knownModels.add(model.modelName);

                // Notify if found a new entrant
                if (this.notifier) {
                    this.notifier.notify(`[${strategyName}] 🚨 NEW MODEL DETECTED: ${model.modelName} (Score: ${modelScore})`);
                }

                // DEFENSE LOGIC (For Failed Significant Challengers)
                // If a significant new model appears but DOES NOT beat the leader, we buy the leader (Defense)
                if (modelScore <= this.currentLeaderScore && this.isSignificant(model.modelName)) {
                    logger.warn(`[${strategyName}] 🛡️ MAJOR CHALLENGER FAILED! ${model.modelName} (${modelScore}) <= Leader Score (${this.currentLeaderScore}). Triggering Defense Buy.`);
                    if (this.currentLeaderCompany) {
                        const buySuccess = await this.executeTrade(this.currentLeaderCompany, 'YES', this.currentLeaderCompany, "Defense (Failed Major Challenger)");
                        if (buySuccess) actionTaken = true;
                    }
                } else if (modelScore <= this.currentLeaderScore) {
                    logger.info(`[${strategyName}] Minor Challenger Failed: ${model.modelName}. Ignoring.`);
                }
            }
        }

        // 4. Global Leader Change Logic (Sniper)
        // This handles BOTH New models and Existing models taking the lead
        if (topCompany && (topCompany !== this.currentLeaderCompany || topModelScore > this.currentLeaderScore)) {

            // Check for Usurpation (Different Company took lead)
            if (topCompany !== this.currentLeaderCompany) {
                logger.warn(`[${strategyName}] 🎯 LEADERSHIP CHANGE! ${topCompany} (${topModelScore}) took lead from ${this.currentLeaderCompany} (${this.currentLeaderScore})`);

                // Trigger Sniper Buy (YES on New Leader)
                logger.info(`[${strategyName}] 📉 Buying New Leader: BUY YES on ${topCompany}`);
                const buyOnly = await this.executeTrade(topCompany, 'YES', topModel.modelName, "Sniper (Long New Leader)");
                if (buyOnly) actionTaken = true;

                // Trigger Short Sell (NO on Old Leader)
                if (this.currentLeaderCompany) {
                    logger.info(`[${strategyName}] 📉 Selling Old Leader: BUY NO on ${this.currentLeaderCompany}`);
                    const sellSuccess = await this.executeTrade(this.currentLeaderCompany, 'NO', topModel.modelName, "Sniper (Short Old Leader)");
                    if (sellSuccess) actionTaken = true;
                }

                // Notify
                if (this.notifier) {
                    this.notifier.notify(
                        `[${strategyName}] 👑 **LEADER CHANGED**\n` +
                        `Old: ${this.currentLeaderCompany} (${this.currentLeaderScore})\n` +
                        `New: ${topCompany} (${topModelScore})\n` +
                        `Model: ${topModel.modelName}`
                    );
                }

            } else {
                // Same company, better score
                if (topModelScore > this.currentLeaderScore) {
                    logger.info(`[${strategyName}] Leader Score Improved! ${this.currentLeaderCompany}: ${this.currentLeaderScore} -> ${topModelScore}`);
                }
            }

            // Update State
            this.currentLeaderCompany = topCompany;
            this.currentLeaderScore = topModelScore;
        }

        return actionTaken;
    }

    protected async executeTrade(company: string, side: 'YES' | 'NO', reasonDetails: string, type: string): Promise<boolean> {
        const strategyName = this.getStrategyName();
        const eventSlug = this.getEventSlug();

        logger.info(`[${strategyName}] Executing ${type} BUY ${side} for ${company}. Reason: ${reasonDetails}`);

        // Fetch market
        const event = await PolyMarketService.getEventBySlug(eventSlug);
        if (!event || !event.markets) {
            logger.error(`[${strategyName}] Event/Market not found: ${eventSlug}`);
            return false;
        }

        const market = event.markets.find(m => m.groupItemTitle === company || m.question.includes(company));

        if (!market) {
            logger.warn(`[${strategyName}] Market for company "${company}" not found.`);
            return false;
        }

        // Find Token ID
        const finalSide = side.toLowerCase(); // 'yes' or 'no'
        const outcomeIndex = market.outcomes.findIndex(o => o.toLowerCase() === finalSide);
        if (outcomeIndex === -1) {
            logger.error(`[${strategyName}] ${side} outcome not found for ${company}`);
            return false;
        }
        const tokenId = market.clobTokenIds[outcomeIndex];

        // Check Price
        const orderBook = await PolyMarketService.getOrderBook(tokenId);
        if (!orderBook || orderBook.asks.length === 0) {
            logger.warn(`[${strategyName}] No ASKs for ${company} ${side}`);
            return false;
        }

        const lowestAsk = orderBook.asks.reduce((min, ask) => {
            const price = parseFloat(ask.price);
            return price < min ? price : min;
        }, 1.0);

        logger.info(`[${strategyName}] ${company} ${side} Lowest Ask: ${lowestAsk}`);

        // buy max price
        const maxPrice = this.config.orderPrice || 0.9;
        if (lowestAsk < maxPrice) {
            const buyAmount = this.config.orderSize || 10; //buy $ amount
            logger.info(`[${strategyName}] MARKET BUY: ${company} ${side} @ ${maxPrice}. Buying ~$${buyAmount}.`);
            const success = await this.executor.execute({
                tokenId: tokenId,
                price: maxPrice,
                size: buyAmount,
                side: 'BUY',
                type: 'MARKET',
                timeInForce: 'FAK',
            });

            if (success) {
                if (this.notifier) {
                    await this.notifier.notify(`[${strategyName}] ✅ MARKET BUY: ${company} ${side} @ ${maxPrice}. Buying ~$${buyAmount}.`);
                }
                return true;
            }
        }

        return false;
    }
}
