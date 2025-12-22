import { LiveBenchBaseStrategy } from './LiveBenchBaseStrategy';
import { LiveBenchData } from '../monitors/LiveBenchMonitor';

export class LiveBenchMathStrategy extends LiveBenchBaseStrategy {

    getStrategyName(): string {
        return 'LiveBenchMathStrategy';
    }

    getEventSlug(): string {
        return 'which-company-will-have-the-best-ai-model-for-math-at-the-end-of-2025';
    }

    getScore(model: LiveBenchData): number {
        return model.mathematicsAverage;
    }
}
