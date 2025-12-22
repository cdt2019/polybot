
import { LiveBenchCodingStrategy } from '../strategies/LiveBenchCodingStrategy';
import { Executor } from '../core/types';
import { OrderParams } from '../executors/PolymarketExecutor';
import { logger } from '../core/logger';
import { MockExecutor } from '../executors/MockExcutor';
import dotenv from 'dotenv';
import { TelegramNotifier } from '../notifiers/TelegramNotifier';
import { ConsoleNotifier } from '../notifiers/ConsoleNotifier';
import { LiveBenchMathStrategy } from '../strategies/LiveBenchMathStrategy';

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
    // const token = process.env.TELEGRAM_BOT_TOKEN;
    // const chatId = process.env.TELEGRAM_CHAT_ID;
    // let notifier;
    // if (token && chatId) {
    //     notifier = new TelegramNotifier(token, chatId);
    // } else {
    //     notifier = new ConsoleNotifier();
    // }
    const notifier = new ConsoleNotifier();
    const executor = new MockExecutor("", notifier, 137);
    //const strategy = new LiveBenchCodingStrategy(executor, { intervalMs: 1000 });
    const strategy = new LiveBenchMathStrategy(executor, { intervalMs: 1000 });
    strategy.setNotifier(notifier);

    // logger.info('--- Step 1: Initialize (Leader: Claude-3.5, Score: 90) ---');
    // await strategy.evaluate([
    //     { modelName: 'claude-3-5-sonnet', codingAverage: 90 } as any
    // ]);

    // logger.info('--- Step 2: New lighter Challenger (Random-7B, Score: 85) ---');
    // // Should IGNORE (No Defense Buy)
    // await strategy.evaluate([
    //     { modelName: 'claude-3-5-sonnet', codingAverage: 90 } as any,
    //     { modelName: 'random-7b-v1', codingAverage: 85 } as any // NEW but ignored
    // ]);

    // logger.info('--- Step 3: New SIGNIFICANT Challenger (Gemini-Fail, Score: 88) ---');
    // // Should BUY Anthropic (Defense) because Gemini is significant but failed
    // await strategy.evaluate([
    //     { modelName: 'claude-3-5-sonnet', codingAverage: 90 } as any,
    //     { modelName: 'random-7b-v1', codingAverage: 85 } as any,
    //     { modelName: 'gemini-3-pro', codingAverage: 88 } as any // NEW & SIGNIFICANT (Regex Match)
    // ]);


    // logger.info('--- Step 4: New Strong Challenger (GPT-Success, Score: 92) ---');
    // // Should BUY OpenAI (Rebound) because GPT is significant but successful
    // await strategy.evaluate([
    //     { modelName: 'claude-3-5-sonnet', codingAverage: 90 } as any,
    //     { modelName: 'random-7b-v1', codingAverage: 85 } as any,
    //     { modelName: 'gemini-3-pro', codingAverage: 88 } as any,
    //     { modelName: 'gpt-5.2-codex-max', codingAverage: 92 } as any // NEW & SIGNIFICANT (Regex Match)
    // ]);

    // logger.info('--- Step 5: Existing Model Usurpation (Claude Improves to 95) ---');
    // // Should BUY YES Anthropic (Sniper)
    // // AND BUY NO OpenAI (Short previous leader)
    // await strategy.evaluate([
    //     { modelName: 'claude-3-5-sonnet', codingAverage: 95 } as any, // Improved!
    //     { modelName: 'random-7b-v1', codingAverage: 85 } as any,
    //     { modelName: 'gemini-3-pro', codingAverage: 88 } as any,
    //     { modelName: 'gpt-5.2-codex-max', codingAverage: 92 } as any
    // ]);

    // logger.info('--- Step 6: Existing Model Usurpation (Claude Improves to 95) ---');
    // // Should IGNORE (No Defense Buy)
    // await strategy.evaluate([
    //     { modelName: 'claude-3-5-sonnet', codingAverage: 95 } as any, // Improved!
    //     { modelName: 'random-7b-v1', codingAverage: 85 } as any,
    //     { modelName: 'gemini-3-pro', codingAverage: 88 } as any,
    //     { modelName: 'gpt-5.2-codex-max', codingAverage: 92 } as any,
    //     { modelName: 'claude-3-5-sonnet', codingAverage: 98 } as any, // Improved!
    // ]);

    logger.info('--- Step 1: Initialize (Leader: Claude-3.5, Score: 90) ---');
    await strategy.evaluate([
        { modelName: 'claude-3-5-sonnet', mathematicsAverage: 90 } as any
    ]);

    logger.info('--- Step 2: New lighter Challenger (Random-7B, Score: 85) ---');
    // Should IGNORE (No Defense Buy)
    await strategy.evaluate([
        { modelName: 'claude-3-5-sonnet', mathematicsAverage: 90 } as any,
        { modelName: 'random-7b-v1', mathematicsAverage: 85 } as any // NEW but ignored
    ]);

    logger.info('--- Step 3: New SIGNIFICANT Challenger (Gemini-Fail, Score: 88) ---');
    // Should BUY Anthropic (Defense) because Gemini is significant but failed
    await strategy.evaluate([
        { modelName: 'claude-3-5-sonnet', mathematicsAverage: 90 } as any,
        { modelName: 'random-7b-v1', mathematicsAverage: 85 } as any,
        { modelName: 'gemini-3-pro', mathematicsAverage: 88 } as any // NEW & SIGNIFICANT (Regex Match)
    ]);


    logger.info('--- Step 4: New Strong Challenger (GPT-Success, Score: 92) ---');
    // Should BUY OpenAI (Rebound) because GPT is significant but successful
    await strategy.evaluate([
        { modelName: 'claude-3-5-sonnet', mathematicsAverage: 90 } as any,
        { modelName: 'random-7b-v1', mathematicsAverage: 85 } as any,
        { modelName: 'gemini-3-pro', mathematicsAverage: 88 } as any,
        { modelName: 'gpt-5.2-codex-max', mathematicsAverage: 92 } as any // NEW & SIGNIFICANT (Regex Match)
    ]);

    logger.info('--- Step 5: Existing Model Usurpation (Claude Improves to 95) ---');
    // Should BUY YES Anthropic (Sniper)
    // AND BUY NO OpenAI (Short previous leader)
    await strategy.evaluate([
        { modelName: 'claude-3-5-sonnet', mathematicsAverage: 95 } as any, // Improved!
        { modelName: 'random-7b-v1', mathematicsAverage: 85 } as any,
        { modelName: 'gemini-3-pro', mathematicsAverage: 88 } as any,
        { modelName: 'gpt-5.2-codex-max', mathematicsAverage: 92 } as any
    ]);

    logger.info('--- Step 6: Existing Model Usurpation (Claude Improves to 95) ---');
    // Should IGNORE (No Defense Buy)
    await strategy.evaluate([
        { modelName: 'claude-3-5-sonnet', mathematicsAverage: 95 } as any, // Improved!
        { modelName: 'random-7b-v1', mathematicsAverage: 85 } as any,
        { modelName: 'gemini-3-pro', mathematicsAverage: 88 } as any,
        { modelName: 'gpt-5.2-codex-max', mathematicsAverage: 92 } as any,
        { modelName: 'claude-3-5-sonnet', mathematicsAverage: 98 } as any, // Improved!
    ]);
}

main().catch(console.error);
