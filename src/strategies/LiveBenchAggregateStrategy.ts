import { Strategy, Executor, Notifier, BotConfig } from '../core/types';
import { OrderParams } from '../executors/PolymarketExecutor';
import { LiveBenchData } from '../monitors/LiveBenchMonitor';
import { LiveBenchCodingStrategy } from './LiveBenchCodingStrategy';
import { LiveBenchMathStrategy } from './LiveBenchMathStrategy';

export class LiveBenchAggregateStrategy implements Strategy<LiveBenchData[]> {
    protected executor: Executor<OrderParams>;
    protected notifier?: Notifier;
    protected config: BotConfig;
    protected liveBenchCodingStrategy: LiveBenchCodingStrategy;
    protected liveBenchMathStrategy: LiveBenchMathStrategy;

    protected liveBenchCodingResult = false;
    protected liveBenchMathResult = false;


    constructor(executor: Executor<OrderParams>, config: BotConfig) {
        this.executor = executor;
        this.config = config;

        this.liveBenchCodingStrategy = new LiveBenchCodingStrategy(executor, config);
        this.liveBenchMathStrategy = new LiveBenchMathStrategy(executor, config);
    }

    async evaluate(data: LiveBenchData[]): Promise<boolean> {

        if (!this.liveBenchCodingResult) {
            const liveBenchCodingResult = await this.liveBenchCodingStrategy.evaluate(data);
            this.liveBenchCodingResult = liveBenchCodingResult;
        }

        if (!this.liveBenchMathResult) {
            const liveBenchMathResult = await this.liveBenchMathStrategy.evaluate(data);
            this.liveBenchMathResult = liveBenchMathResult;
        }

        return Promise.resolve(this.liveBenchCodingResult && this.liveBenchMathResult);
    }

    /**
     * Optional: Sets the notifier for sending alerts.
     */
    setNotifier?(notifier: Notifier): void {
        this.notifier = notifier;
        this.liveBenchCodingStrategy.setNotifier(notifier);
        this.liveBenchMathStrategy.setNotifier(notifier);
    }
}