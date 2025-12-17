import { Executor, BotConfig } from '../core/types';
import { OrderParams } from '../executors/PolymarketExecutor';
import { LMArenaBaseStrategy } from './LMArenaBaseStrategy';

/**
 * Strategy for LMArena Text Leaderboard (NO Style Control)
 * 
 * Monitors: https://lmarena.ai/leaderboard/text/overall-no-style-control
 * 
 * Markets change based on time period:
 * - December 2025: ends Dec 31, 2025 12:00 PM ET
 * - January 2026: ends Jan 31, 2026 12:00 PM ET
 * - March 2026: ends Mar 31, 2026 12:00 PM ET
 */
export class LMArenaTextNoStyleStrategy extends LMArenaBaseStrategy {

    constructor(executor: Executor<OrderParams>, config: BotConfig) {
        super(executor, config);
    }

    getStrategyName(): string {
        return 'LMArenaTextNoStyleStrategy';
    }

    getLeaderboardType(): string {
        return 'LMArena Text (NO Style Control)';
    }

    getEventPeriods() {
        return [
            {
                label: 'December 2025',
                endDate: new Date('2025-12-31T17:00:00Z'),
                slugs: {
                    rank1: 'which-company-has-best-ai-model-end-of-2025',
                    rank2: 'which-company-has-second-best-ai-model-end-of-december',
                    rank3: 'which-company-has-the-third-best-ai-model-end-of-december'
                }
            },
            {
                label: 'January 2026',
                endDate: new Date('2026-01-31T17:00:00Z'),
                slugs: {
                    rank1: 'which-company-has-the-best-ai-model-end-of-january',
                    rank2: 'which-company-has-the-second-best-ai-model-end-of-january',
                    rank3: 'which-company-has-the-third-best-ai-model-end-of-january'
                }
            },
            {
                label: 'March 2026',
                endDate: new Date('2026-03-31T16:00:00Z'),
                slugs: {
                    rank1: 'which-company-has-the-best-ai-model-end-of-march-751',
                    rank2: 'which-company-has-the-second-best-ai-model-end-of-march',
                    rank3: 'which-company-has-the-third-best-ai-model-end-of-march'
                }
            },
            {
                label: 'June 2026',
                endDate: new Date('2026-06-30T16:00:00Z'),
                slugs: {
                    rank1: 'which-company-has-best-ai-model-end-of-june',
                    rank2: 'which-company-has-second-best-ai-model-end-of-june',
                    rank3: ''
                }
            }
        ];
    }
}