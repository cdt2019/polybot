
import { LiveBenchCodingStrategy } from '../strategies/LiveBenchCodingStrategy';
import { Executor } from '../core/types';
import { OrderParams } from '../executors/PolymarketExecutor';
import { logger } from '../core/logger';
import { MockExecutor } from '../executors/MockExcutor';
import dotenv from 'dotenv';
import { TelegramNotifier } from '../notifiers/TelegramNotifier';
import { ConsoleNotifier } from '../notifiers/ConsoleNotifier';

dotenv.config();
// Mock Executor
// class DefaultMockExecutor implements Executor<OrderParams> {
//     async execute(params: OrderParams): Promise<boolean> {
//         logger.info(`[MockExecutor] TRADING: ${params.side} ${params.size} of ${params.tokenId} (Price: ${params.price})`);
//         return true;
//     }
// }
function initMockExecutor(): Executor<OrderParams> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    let notifier;
    if (token && chatId) {
        notifier = new TelegramNotifier(token, chatId);
    } else {
        notifier = new ConsoleNotifier();
    }
    return new MockExecutor("", notifier, 137);
}

async function main() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    let notifier;
    if (token && chatId) {
        notifier = new TelegramNotifier(token, chatId);
    } else {
        notifier = new ConsoleNotifier();
    }
    const executor = new MockExecutor("", notifier, 137);
    const strategy = new LiveBenchCodingStrategy(executor, { intervalMs: 1000 });
    strategy.setNotifier(notifier);

    logger.info('--- Step 1: Initialize (Leader: Claude-3.5, Score: 90) ---');
    await strategy.evaluate([
        { modelName: 'claude-3-5-sonnet', score: 90 }
    ]);

    logger.info('--- Step 2: New lighter Challenger (Random-7B, Score: 85) ---');
    // Should IGNORE (No Defense Buy)
    await strategy.evaluate([
        { modelName: 'claude-3-5-sonnet', score: 90 },
        { modelName: 'random-7b-v1', score: 85 } // NEW but ignored
    ]);

    logger.info('--- Step 3: New SIGNIFICANT Challenger (Gemini-Fail, Score: 88) ---');
    // Should BUY Anthropic (Defense) because Gemini is significant but failed
    await strategy.evaluate([
        { modelName: 'claude-3-5-sonnet', score: 90 },
        { modelName: 'random-7b-v1', score: 85 },
        { modelName: 'gemini-3-pro', score: 88 } // NEW & SIGNIFICANT (Regex Match)
    ]);


    logger.info('--- Step 4: New Strong Challenger (GPT-Success, Score: 92) ---');
    // Should BUY OpenAI (Rebound) because GPT is significant but successful
    await strategy.evaluate([
        { modelName: 'claude-3-5-sonnet', score: 90 },
        { modelName: 'random-7b-v1', score: 85 },
        { modelName: 'gemini-3-pro', score: 88 },
        { modelName: 'gpt-5.2-codex-max', score: 92 } // NEW & SIGNIFICANT (Regex Match)
    ]);
}

main().catch(console.error);
