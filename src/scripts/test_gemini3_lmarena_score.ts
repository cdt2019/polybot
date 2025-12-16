
import { Gemini3LMArenaScoreStrategy } from '../strategies/Gemini3LMArenaScoreStrategy';
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
    const strategy = new Gemini3LMArenaScoreStrategy(executor, { intervalMs: 1000 });
    strategy.setNotifier(notifier);

    logger.info('--- Step 0: no engouh score 1486 ---');
    await strategy.evaluate({
        lastUpdated: "Dec 11, 2025",
        totalVotes: 4808127,
        totalModels: 283,
        modelRanks: [
            {
                rank: 1,
                rankSpread: "1◄─►1",
                modelName: "claude-opus-4-5-20251101",
                score: 1442,
                confidenceInterval: "±7",
                votes: 12396,
                organization: "Anthropic",
                license: "Proprietary"
            }]
    } as any);

    logger.info('--- Step 1: no engouh score 1486 ---');
    await strategy.evaluate({
        lastUpdated: "Dec 11, 2025",
        totalVotes: 4808127,
        totalModels: 283,
        modelRanks: [
            {
                rank: 1,
                rankSpread: "1◄─►1",
                modelName: "gemini-3-pro",
                score: 1486,
                confidenceInterval: "±6",
                votes: 17644,
                organization: "Google",
                license: "Proprietary"
            }, {
                rank: 2,
                rankSpread: "1◄─►1",
                modelName: "claude-opus-4-5-20251101",
                score: 1442,
                confidenceInterval: "±7",
                votes: 12396,
                organization: "Anthropic",
                license: "Proprietary"
            }]
    } as any);

    logger.info('--- Step 2:  score 1550---');
    // Should IGNORE (No Defense Buy)
    await strategy.evaluate({
        lastUpdated: "Dec 15, 2025",
        totalVotes: 4808127,
        totalModels: 283,
        modelRanks: [
            {
                rank: 1,
                rankSpread: "1◄─►1",
                modelName: "gemini-3-pro",
                score: 1550,
                confidenceInterval: "±6",
                votes: 17644,
                organization: "Google",
                license: "Proprietary"
            }]
    } as any);

    logger.info('--- Step 3:  score 1650---');
    // Should BUY Anthropic (Defense) because Gemini is significant but failed
    await strategy.evaluate({
        lastUpdated: "Dec 26, 2025",
        totalVotes: 4808127,
        totalModels: 283,
        modelRanks: [
            {
                rank: 1,
                rankSpread: "1◄─►1",
                modelName: "gemini-3-pro",
                score: 1650,
                confidenceInterval: "±6",
                votes: 37644,
                organization: "Google",
                license: "Proprietary"
            }]
    } as any);
}


main().catch(console.error);
