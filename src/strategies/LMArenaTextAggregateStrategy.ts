import { Strategy, Executor, Notifier, BotConfig } from '../core/types';
import { OrderParams } from '../executors/PolymarketExecutor';
import { LMArenaResult } from '../monitors/LMArenaTextMonitor';
import { LMArenaTextNoStyleStrategy } from './LMArenaTextNoStyleStrategy';
import { Gemini3LMArenaScoreStrategy } from './Gemini3LMArenaScoreStrategy';

export class LMArenaTextAggregateStrategy implements Strategy<LMArenaResult> {
    protected executor: Executor<OrderParams>;
    protected notifier?: Notifier;
    protected config: BotConfig;
    protected lmarenaTextNoStyleStrategy: LMArenaTextNoStyleStrategy;
    protected gemini3LMArenaScoreStrategy: Gemini3LMArenaScoreStrategy;

    protected lmarenaTextNoStyleResult = false;
    protected gemini3LMArenaScoreResult = false;


    constructor(executor: Executor<OrderParams>, config: BotConfig) {
        this.executor = executor;
        this.config = config;

        this.lmarenaTextNoStyleStrategy = new LMArenaTextNoStyleStrategy(executor, config);
        this.gemini3LMArenaScoreStrategy = new Gemini3LMArenaScoreStrategy(executor, config);
    }

    async evaluate(data: LMArenaResult): Promise<boolean> {

        if (!this.lmarenaTextNoStyleResult) {
            const lmarenaResult = await this.lmarenaTextNoStyleStrategy.evaluate(data);
            this.lmarenaTextNoStyleResult = lmarenaResult;
        }

        if (!this.gemini3LMArenaScoreResult) {
            const gemini3Result = await this.gemini3LMArenaScoreStrategy.evaluate(data);
            this.gemini3LMArenaScoreResult = gemini3Result;
        }

        return Promise.resolve(this.lmarenaTextNoStyleResult && this.gemini3LMArenaScoreResult);
    }

    /**
     * Optional: Sets the notifier for sending alerts.
     */
    setNotifier?(notifier: Notifier): void {
        this.notifier = notifier;
        this.lmarenaTextNoStyleStrategy.setNotifier(notifier);
        this.gemini3LMArenaScoreStrategy.setNotifier(notifier);
    }
}