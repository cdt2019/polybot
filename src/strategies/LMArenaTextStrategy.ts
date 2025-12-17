import { Executor, BotConfig } from '../core/types';
import { OrderParams } from '../executors/PolymarketExecutor';
import { LMArenaBaseStrategy } from './LMArenaBaseStrategy';

/**
 * Strategy for LMArena Text Leaderboard (Style Control ON)
 * 
 * Monitors: https://lmarena.ai/leaderboard/text
 * 
 * Markets change based on time period:
 * - December 2025: ends Dec 31, 2025 12:00 PM ET
 * - January 2026: ends Jan 31, 2026 12:00 PM ET
 * - March 2026: ends Mar 31, 2026 12:00 PM ET
 */
export class LMArenaTextStrategy extends LMArenaBaseStrategy {

    constructor(executor: Executor<OrderParams>, config: BotConfig) {
        super(executor, config);
    }

    getStrategyName(): string {
        return 'LMArenaStyleControlOnStrategy';
    }

    getLeaderboardType(): string {
        return 'LMArena Text (Style Control ON)';
    }

    getEventPeriods() {
        return [
            {
                label: 'December 2025',
                // Dec 31, 2025 12:00 PM ET = 17:00 UTC
                endDate: new Date('2025-12-31T17:00:00Z'),
                slugs: {
                    rank1: 'which-company-has-top-ai-model-end-of-december-style-control-on',
                    rank2: 'which-company-has-the-2-ai-model-end-of-december-style-control-on',
                    rank3: 'which-company-has-the-3-ai-model-end-of-december-style-control-on'
                }
            },
            {
                label: 'January 2026',
                // Jan 31, 2026 12:00 PM ET = 17:00 UTC
                endDate: new Date('2026-01-31T17:00:00Z'),
                slugs: {
                    rank1: 'which-company-has-the-best-ai-model-end-of-january-style-control-on',
                    rank2: 'which-company-has-the-2-ai-model-end-of-january-style-control-on',
                    rank3: 'which-company-has-the-3-ai-model-end-of-january-style-control-on'
                }
            },
            {
                label: 'March 2026',
                // Mar 31, 2026 12:00 PM ET = 16:00 UTC (DST starts)
                endDate: new Date('2026-03-31T16:00:00Z'),
                slugs: {
                    rank1: 'which-company-has-the-top-ai-model-end-of-march-style-control-on',
                    rank2: 'which-company-has-the-2-ai-model-end-of-march-style-control-on',
                    rank3: 'which-company-has-the-3-ai-model-end-of-march-style-control-on'
                }
            },
            {
                label: 'June 2026',
                // June 30, 2026 12:00 PM ET = 16:00 UTC (DST starts)
                endDate: new Date('2026-06-30T16:00:00Z'),
                slugs: {
                    rank1: 'which-company-has-top-ai-model-end-of-june-style-control-on',
                    rank2: '',
                    rank3: ''
                }
            }
        ];
    }
}