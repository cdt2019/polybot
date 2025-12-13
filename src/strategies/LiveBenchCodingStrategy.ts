import { Strategy, Executor, Notifier, BotConfig } from '../core/types';
import { PolyMarketService } from '../services/PolyMarketService';
import { OrderParams } from '../executors/PolymarketExecutor';
import { logger } from '../core/logger';
import { LiveBenchCodingData } from '../monitors/LiveBenchCodingMonitor';

export class LiveBenchCodingStrategy implements Strategy<LiveBenchCodingData[]> {
    private executor: Executor<OrderParams>;
    private notifier?: Notifier;
    private config: BotConfig;
    private eventSlug = 'which-company-will-have-the-best-ai-model-for-coding-at-the-end-of-2025';

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
    // Matches versions like gpt-5.2, gemini-3, etc.
    private significantPatterns: RegExp[] = [
        /gpt-5.2-codex/i,
        /gemini-3(.0)?-flash/i,
        // /grok-4-2/i,
    ];

    // Track known models to detect new entrants
    private knownModels: Set<string> = new Set();
    // Track the current leader info
    private currentLeaderCompany: string | null = null;
    private currentLeaderScore: number = 0;

    constructor(executor: Executor<OrderParams>, config: BotConfig) {
        this.executor = executor;
        this.config = config;
    }

    setNotifier(notifier: Notifier): void {
        this.notifier = notifier;
    }

    private getCompany(modelName: string): string | null {
        const lowerName = modelName.toLowerCase();
        for (const [key, company] of Object.entries(this.companyMap)) {
            if (lowerName.includes(key)) {
                return company;
            }
        }
        return null;
    }

    private isSignificant(modelName: string): boolean {
        return this.significantPatterns.some(regex => regex.test(modelName));
    }

    async evaluate(data: LiveBenchCodingData[] | null): Promise<boolean> {
        if (!data || data.length === 0) {
            return false;
        }

        // 1. Identify current top model in this poll
        const topModel = data[0];
        const topCompany = this.getCompany(topModel.modelName);

        if (!topCompany) {
            logger.warn(`[LiveBenchCodingStrategy] Could not map top model "${topModel.modelName}" to a known company.`);
        }

        let actionTaken = false;

        // 2. Scan for NEW models (Challengers)
        for (const model of data) {
            if (!this.knownModels.has(model.modelName)) {
                // FOUND A NEW ENTRANT
                logger.info(`[LiveBenchCodingStrategy] 🚨 NEW MODEL DETECTED: ${model.modelName} (Score: ${model.score})`);

                // Add to known set immediately
                this.knownModels.add(model.modelName);

                // If initialization, skip logic
                if (this.currentLeaderCompany === null) {
                    continue;
                }
                // Notify if found a new entrant
                if (this.notifier) {
                    this.notifier.notify(`[LiveBenchCodingStrategy] 🚨 NEW MODEL DETECTED: ${model.modelName} (Score: ${model.score})`);
                }
                // CHALLENGER LOGIC
                if (model.score > this.currentLeaderScore) {
                    // SCENARIO A: SUCCESSFUL CHALLENGER (Sniper)
                    // It beat the old score. Is it the new #1?
                    const newLeaderCompany = this.getCompany(model.modelName);
                    if (newLeaderCompany && newLeaderCompany !== this.currentLeaderCompany) {
                        logger.warn(`[LiveBenchCodingStrategy] 🎯 CHALLENGER SUCCESS! ${model.modelName} (${model.score}) > Old Leader Score (${this.currentLeaderScore})`);
                        // Execute BUY on NEW LEADER
                        actionTaken = await this.executeBuy(newLeaderCompany, model.modelName, "Sniper (Usurpation)");
                    }
                } else {
                    // SCENARIO B: FAILED CHALLENGER (Defense/Rebound)
                    // Check Significance
                    if (this.isSignificant(model.modelName)) {
                        logger.warn(`[LiveBenchCodingStrategy] 🛡️ MAJOR CHALLENGER FAILED! ${model.modelName} (${model.score}) < Leader Score (${this.currentLeaderScore}). Triggering Defense Buy.`);
                        if (this.currentLeaderCompany) {
                            actionTaken = await this.executeBuy(this.currentLeaderCompany, this.currentLeaderCompany, "Defense (Failed Major Challenger)");
                        }
                    } else {
                        logger.info(`[LiveBenchCodingStrategy] Minor Challenger Failed: ${model.modelName}. Ignoring.`);
                    }
                }
            }
        }

        // 3. Update Leader State
        if (this.currentLeaderCompany === null) {
            if (topCompany) {
                this.currentLeaderCompany = topCompany;
                this.currentLeaderScore = topModel.score;
                // Populate all initial known models
                data.forEach(m => this.knownModels.add(m.modelName));
                logger.info(`[LiveBenchCodingStrategy] Initialized. Leader: ${this.currentLeaderCompany} (${topModel.score}). Known Models: ${this.knownModels.size}`);
            }
            return false;
        }

        // Update current leader if changed
        if (topCompany && (topCompany !== this.currentLeaderCompany || topModel.score > this.currentLeaderScore)) {
            this.currentLeaderCompany = topCompany;
            this.currentLeaderScore = topModel.score;
        }

        return actionTaken;
    }

    private async executeBuy(company: string, reasonDetails: string, type: string): Promise<boolean> {
        logger.info(`[LiveBenchCodingStrategy] Executing ${type} BUY for ${company}. Reason: ${reasonDetails}`);

        // Fetch market
        const event = await PolyMarketService.getEventBySlug(this.eventSlug);
        if (!event || !event.markets) {
            logger.error(`[LiveBenchCodingStrategy] Event/Market not found: ${this.eventSlug}`);
            return false;
        }

        const market = event.markets.find(m => m.groupItemTitle === company || m.question.includes(company));

        if (!market) {
            logger.warn(`[LiveBenchCodingStrategy] Market for company "${company}" not found.`);
            return false;
        }

        // Find "Yes" token
        const yesIndex = market.outcomes.findIndex(o => o.toLowerCase() === 'yes');
        if (yesIndex === -1) {
            logger.error(`[LiveBenchCodingStrategy] YES outcome not found for ${company}`);
            return false;
        }
        const tokenId = market.clobTokenIds[yesIndex];

        // Check Price
        const orderBook = await PolyMarketService.getOrderBook(tokenId);
        if (!orderBook || orderBook.asks.length === 0) {
            logger.warn(`[LiveBenchCodingStrategy] No ASKs for ${company}`);
            return false;
        }

        // // Asks are sorted by price ascending usually, but let's be safe
        // // Price is string in API response
        const lowestAsk = orderBook.asks.reduce((min, ask) => {
            const price = parseFloat(ask.price);
            return price < min ? price : min;
        }, 1.0);


        // Sort asks by price ascending (cheap first)
        // const sortedAsks = orderBook.asks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
        // const lowestAsk = parseFloat(sortedAsks[0].price) || 1.0; // Default to 1.0 if no asks  

        logger.info(`[LiveBenchCodingStrategy] ${company} Lowest Ask: ${lowestAsk}`);

        // buy max price
        const maxPrice = this.config.orderPrice || 0.9;
        if (lowestAsk < maxPrice) {
            const buyAmount = this.config.orderSize || 10; //buy $ amount
            logger.info(`[LiveBenchCodingStrategy] MARKET BUY: ${company} @ ${maxPrice}. Buying ~$${buyAmount}.`);
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
                    await this.notifier.notify(`[LiveBenchCodingStrategy] ✅ MARKET BUY: ${company} @ ${maxPrice}. Buyed ~$${buyAmount}.`);
                }
                return true;
            }
        }

        return false;
    }
}
