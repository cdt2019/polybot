import { LMArenaTextStrategy } from '../strategies/LMArenaTextStrategy';
import { LMArenaTextNoStyleStrategy } from '../strategies/LMArenaTextNoStyleStrategy';
import { LMArenaBaseStrategy } from '../strategies/LMArenaBaseStrategy';
import { Executor } from '../core/types';
import { OrderParams } from '../executors/PolymarketExecutor';
import { logger } from '../core/logger';
import { MockExecutor } from '../executors/MockExcutor';
import { LMArenaResult, LMArenaData } from '../monitors/LMArenaTextMonitor';
import dotenv from 'dotenv';
import { TelegramNotifier } from '../notifiers/TelegramNotifier';
import { ConsoleNotifier } from '../notifiers/ConsoleNotifier';

dotenv.config();

// ==================== Mock Data Helpers ====================

function createMockModelData(
    rank: number,
    modelName: string,
    score: number,
    organization?: string
): LMArenaData {
    return {
        rank,
        rankSpread: `${rank} <-> ${rank}`,
        modelName,
        score,
        confidenceInterval: '±5',
        votes: 100000 + Math.floor(Math.random() * 50000),
        organization: organization || inferOrganization(modelName),
        license: 'Proprietary'
    };
}

function inferOrganization(modelName: string): string {
    const lower = modelName.toLowerCase();
    if (lower.includes('claude')) return 'Anthropic';
    if (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3')) return 'OpenAI';
    if (lower.includes('gemini')) return 'Google';
    if (lower.includes('grok')) return 'xAI';
    if (lower.includes('deepseek')) return 'DeepSeek';
    if (lower.includes('qwen')) return 'Alibaba';
    if (lower.includes('llama')) return 'Meta';
    if (lower.includes('mistral')) return 'Mistral';
    if (lower.includes('glm')) return 'Zhipu';
    return 'Unknown';
}

function createMockResult(
    lastUpdated: string,
    models: LMArenaData[]
): LMArenaResult {
    return {
        lastUpdated,
        totalVotes: 4821345,
        totalModels: models.length,
        modelRanks: models
    };
}

function initNotifier() {
    // const token = process.env.TELEGRAM_BOT_TOKEN;
    // const chatId = process.env.TELEGRAM_CHAT_ID;
    // if (token && chatId) {
    //     return new TelegramNotifier(token, chatId);
    // }
    return new ConsoleNotifier();
}

function initMockExecutor() {
    const notifier = initNotifier();
    return new MockExecutor("LMArenaTest", notifier, 137);
}

// ==================== Test Cases ====================

async function testInitialization() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST 1: Initialization');
    console.log('='.repeat(60));

    const executor = initMockExecutor();
    const strategy = new LMArenaTextStrategy(executor, { intervalMs: 1000 });
    strategy.setNotifier(initNotifier());

    const initialData = createMockResult('Dec 17, 2025', [
        createMockModelData(1, 'gpt-4o-latest', 1380, 'OpenAI'),
        createMockModelData(2, 'gemini-2.0-flash-thinking-exp', 1375, 'Google'),
        createMockModelData(3, 'claude-3-5-sonnet-20241022', 1370, 'Anthropic'),
        createMockModelData(4, 'grok-2-1212', 1350, 'xAI'),
        createMockModelData(5, 'deepseek-v3', 1340, 'DeepSeek'),
    ]);

    const result = await strategy.evaluate(initialData);

    console.log('\n?? State Summary:');
    console.log(JSON.stringify(strategy.getStateSummary(), null, 2));

    console.log(`\n? Initialization Result: ${result ? 'Action Taken' : 'No Action (Expected)'}`);
}

async function testInvalidLastUpdated() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST 2: Invalid lastUpdated Format');
    console.log('='.repeat(60));

    const executor = initMockExecutor();
    const strategy = new LMArenaTextStrategy(executor, { intervalMs: 1000 });

    // First, initialize with valid data
    const validData = createMockResult('Dec 17, 2025', [
        createMockModelData(1, 'gpt-4o-latest', 1380),
        createMockModelData(2, 'gemini-2.0-flash', 1375),
        createMockModelData(3, 'claude-3-5-sonnet', 1370),
    ]);
    await strategy.evaluate(validData);

    console.log('\n--- Testing invalid formats ---');

    // Test various invalid formats
    const invalidFormats = [
        '',
        'Last Updated',
        'undefined',
        'null',
        'Dec 2025',       // Missing day
        '2025',           // Just year
        'Yesterday',
    ];

    for (const invalidDate of invalidFormats) {
        const invalidData = createMockResult(invalidDate, [
            createMockModelData(1, 'gpt-4o-latest', 1380),
            createMockModelData(2, 'gemini-2.0-flash', 1375),
            createMockModelData(3, 'claude-3-5-sonnet', 1370),
        ]);

        const result = await strategy.evaluate(invalidData);
        console.log(`  Format "${invalidDate}" → ${result ? 'Processed (Unexpected!)' : 'Skipped (Expected)'}`);
    }

    console.log('\n? Invalid format handling test complete');
}

async function testRankChange() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST 3: Rank Change Detection');
    console.log('='.repeat(60));

    const executor = initMockExecutor();
    const strategy = new LMArenaTextStrategy(executor, { intervalMs: 1000 });
    strategy.setNotifier(initNotifier());

    // Step 1: Initialize
    console.log('\n--- Step 1: Initialize (OpenAI #1, Google #2, Anthropic #3) ---');
    await strategy.evaluate(createMockResult('Dec 17, 2025', [
        createMockModelData(1, 'gpt-4o-latest', 1380, 'OpenAI'),
        createMockModelData(2, 'gemini-2.0-flash-thinking-exp', 1375, 'Google'),
        createMockModelData(3, 'claude-3-5-sonnet-20241022', 1370, 'Anthropic'),
        createMockModelData(4, 'grok-2-1212', 1350, 'xAI'),
    ]));

    // Step 2: Rank #1 changes (Google overtakes OpenAI)
    console.log('\n--- Step 2: Leaderboard Update - Google takes #1 from OpenAI ---');
    console.log('Expected: BUY YES for Google (rank1), BUY NO for OpenAI (rank1)');
    await strategy.evaluate(createMockResult('Dec 18, 2025', [
        createMockModelData(1, 'gemini-2.0-flash-thinking-exp', 1385, 'Google'),  // Now #1
        createMockModelData(2, 'gpt-4o-latest', 1380, 'OpenAI'),               // Now #2
        createMockModelData(3, 'claude-3-5-sonnet-20241022', 1370, 'Anthropic'),
        createMockModelData(4, 'grok-2-1212', 1350, 'xAI'),
    ]));

    // Step 3: Multiple rank changes
    console.log('\n--- Step 3: Leaderboard Update - xAI jumps to #2, Anthropic takes #1 ---');
    console.log('Expected: Multiple trades for rank1, rank2, rank3 changes');
    await strategy.evaluate(createMockResult('Dec 19, 2025', [
        createMockModelData(1, 'claude-3-5-sonnet-20241022', 1395, 'Anthropic'),  // Now #1
        createMockModelData(2, 'grok-2-1212', 1390, 'xAI'),                        // Jumped to #2
        createMockModelData(3, 'gemini-2.0-flash-thinking-exp', 1385, 'Google'),  // Now #3
        createMockModelData(4, 'gpt-4o-latest', 1380, 'OpenAI'),               // Now #4
    ]));

    console.log('\n?? Final State:');
    console.log(JSON.stringify(strategy.getStateSummary(), null, 2));
}

async function testNewModelDetection() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST 4: New Model Detection');
    console.log('='.repeat(60));

    const executor = initMockExecutor();
    const strategy = new LMArenaTextStrategy(executor, { intervalMs: 1000 });
    strategy.setNotifier(initNotifier());

    // Step 1: Initialize with 3 models
    console.log('\n--- Step 1: Initialize with 3 models ---');
    await strategy.evaluate(createMockResult('Dec 17, 2025', [
        createMockModelData(1, 'gpt-4o-latest', 1380),
        createMockModelData(2, 'gemini-2.0-flash', 1375),
        createMockModelData(3, 'claude-3-5-sonnet', 1370),
    ]));

    // Step 2: New model appears (not in top 3)
    console.log('\n--- Step 2: New model DeepSeek-V3 appears at rank 4 ---');
    console.log('Expected: Log new model, no trade (not in top 3)');
    await strategy.evaluate(createMockResult('Dec 18, 2025', [
        createMockModelData(1, 'gpt-4o-latest', 1380),
        createMockModelData(2, 'gemini-2.0-flash', 1375),
        createMockModelData(3, 'claude-3-5-sonnet', 1370),
        createMockModelData(4, 'deepseek-v3', 1365),  // NEW
    ]));

    // Step 3: New significant model enters top 3
    console.log('\n--- Step 3: New model GPT-5 enters at #1 ---');
    console.log('Expected: Log new model, Trade for rank change');
    await strategy.evaluate(createMockResult('Dec 19, 2025', [
        createMockModelData(1, 'gpt-5-turbo', 1450),   // NEW and #1!
        createMockModelData(2, 'gpt-4o-latest', 1380),
        createMockModelData(3, 'gemini-2.0-flash', 1375),
        createMockModelData(4, 'claude-3-5-sonnet', 1370),
        createMockModelData(5, 'deepseek-v3', 1365),
    ]));

    console.log('\n?? Final State:');
    const summary = strategy.getStateSummary() as any;
    console.log(`Known Models: ${summary.knownModelsCount}`);
    console.log(`Executed Trades: ${summary.executedTradesCount}`);
}

async function testSameLeaderboardNoDuplicateTrade() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST 5: Same Leaderboard Version - No Duplicate Trades');
    console.log('='.repeat(60));

    const executor = initMockExecutor();
    const strategy = new LMArenaTextStrategy(executor, { intervalMs: 1000 });
    strategy.setNotifier(initNotifier());

    // Initialize
    console.log('\n--- Step 1: Initialize ---');
    await strategy.evaluate(createMockResult('Dec 17, 2025', [
        createMockModelData(1, 'gpt-4o-latest', 1380),
        createMockModelData(2, 'gemini-2.0-flash', 1375),
        createMockModelData(3, 'claude-3-5-sonnet', 1370),
    ]));

    // Rank change with new leaderboard version
    console.log('\n--- Step 2: Rank change (Dec 18) - First trade ---');
    await strategy.evaluate(createMockResult('Dec 18, 2025', [
        createMockModelData(1, 'gemini-2.0-flash', 1385),  // Took #1
        createMockModelData(2, 'gpt-4o-latest', 1380),
        createMockModelData(3, 'claude-3-5-sonnet', 1370),
    ]));

    // Same data again (simulate re-poll)
    console.log('\n--- Step 3: Same data polled again (Dec 18) - Should skip trades ---');
    await strategy.evaluate(createMockResult('Dec 18, 2025', [
        createMockModelData(1, 'gemini-2.0-flash', 1385),
        createMockModelData(2, 'gpt-4o-latest', 1380),
        createMockModelData(3, 'claude-3-5-sonnet', 1370),
    ]));

    // New leaderboard version, same rankings
    console.log('\n--- Step 4: New leaderboard version (Dec 19) but same rankings ---');
    console.log('Expected: No trades (no rank changes)');
    await strategy.evaluate(createMockResult('Dec 19, 2025', [
        createMockModelData(1, 'gemini-2.0-flash', 1386),  // Score changed, rank same
        createMockModelData(2, 'gpt-4o-latest', 1381),
        createMockModelData(3, 'claude-3-5-sonnet', 1371),
    ]));

    console.log('\n?? Trade History:');
    const summary = strategy.getStateSummary() as any;
    console.log(JSON.stringify(summary.executedTrades, null, 2));
}

async function testLeaderboardUpdateAllowsRetrade() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST 6: Leaderboard Update Allows Re-trade');
    console.log('='.repeat(60));

    const executor = initMockExecutor();
    const strategy = new LMArenaTextStrategy(executor, { intervalMs: 1000 });
    strategy.setNotifier(initNotifier());

    // Initialize
    console.log('\n--- Step 1: Initialize ---');
    await strategy.evaluate(createMockResult('Dec 17, 2025', [
        createMockModelData(1, 'gpt-4o-latest', 1380),
        createMockModelData(2, 'gemini-2.0-flash', 1375),
        createMockModelData(3, 'claude-3-5-sonnet', 1370),
    ]));

    // Google takes #1
    console.log('\n--- Step 2: Google takes #1 (Dec 18) ---');
    await strategy.evaluate(createMockResult('Dec 18, 2025', [
        createMockModelData(1, 'gemini-2.0-flash', 1385),
        createMockModelData(2, 'gpt-4o-latest', 1380),
        createMockModelData(3, 'claude-3-5-sonnet', 1370),
    ]));

    // OpenAI takes back #1
    console.log('\n--- Step 3: OpenAI takes back #1 (Dec 19) ---');
    console.log('Expected: New trades allowed because leaderboard version changed');
    await strategy.evaluate(createMockResult('Dec 19, 2025', [
        createMockModelData(1, 'gpt-4o-latest', 1390),
        createMockModelData(2, 'gemini-2.0-flash', 1385),
        createMockModelData(3, 'claude-3-5-sonnet', 1370),
    ]));

    // Google takes #1 again
    console.log('\n--- Step 4: Google takes #1 again (Dec 20) ---');
    console.log('Expected: Trades allowed (different leaderboard version from Step 2)');
    await strategy.evaluate(createMockResult('Dec 20, 2025', [
        createMockModelData(1, 'gemini-2.0-flash', 1395),
        createMockModelData(2, 'gpt-4o-latest', 1390),
        createMockModelData(3, 'claude-3-5-sonnet', 1370),
    ]));

    console.log('\n?? Trade History:');
    const summary = strategy.getStateSummary() as any;
    console.log(`Total Trades Executed: ${summary.executedTradesCount}`);
}

async function testNoStyleControlStrategy() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST 7: No Style Control Strategy (Different Event Slugs)');
    console.log('='.repeat(60));

    const executor = initMockExecutor();
    const strategy = new LMArenaTextNoStyleStrategy(executor, { intervalMs: 1000 });
    strategy.setNotifier(initNotifier());

    // Initialize
    console.log('\n--- Step 1: Initialize ---');
    await strategy.evaluate(createMockResult('Dec 17, 2025', [
        createMockModelData(1, 'gpt-4o-latest', 1380),
        createMockModelData(2, 'gemini-2.0-flash', 1375),
        createMockModelData(3, 'claude-3-5-sonnet', 1370),
    ]));

    // Rank change
    console.log('\n--- Step 2: Rank change ---');
    console.log('Expected: Uses no-style-control event slugs');
    await strategy.evaluate(createMockResult('Dec 18, 2025', [
        createMockModelData(1, 'gemini-2.0-flash', 1385),
        createMockModelData(2, 'gpt-4o-latest', 1380),
        createMockModelData(3, 'claude-3-5-sonnet', 1370),
    ]));

    console.log('\n?? State Summary (showing event slugs):');
    const summary = strategy.getStateSummary() as any;
    console.log(`Leaderboard Type: ${summary.leaderboardType}`);
    console.log(`Event Period: ${summary.currentEventPeriod?.label}`);
    console.log(`Event Slugs:`, summary.currentEventPeriod?.slugs);
}

async function testScoreChangeNoRankChange() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST 8: Score Change Without Rank Change');
    console.log('='.repeat(60));

    const executor = initMockExecutor();
    const strategy = new LMArenaTextStrategy(executor, { intervalMs: 1000 });
    strategy.setNotifier(initNotifier());

    // Initialize
    console.log('\n--- Step 1: Initialize ---');
    await strategy.evaluate(createMockResult('Dec 17, 2025', [
        createMockModelData(1, 'gpt-4o-latest', 1380),
        createMockModelData(2, 'gemini-2.0-flash', 1375),
        createMockModelData(3, 'claude-3-5-sonnet', 1370),
    ]));

    // Score increase, same rank
    console.log('\n--- Step 2: OpenAI score increases (1380 → 1390), still #1 ---');
    console.log('Expected: Log score change, NO trade');
    await strategy.evaluate(createMockResult('Dec 18, 2025', [
        createMockModelData(1, 'gpt-4o-latest', 1390),  // Score up
        createMockModelData(2, 'gemini-2.0-flash', 1375),
        createMockModelData(3, 'claude-3-5-sonnet', 1370),
    ]));

    // Score decrease
    console.log('\n--- Step 3: Google score decreases (1375 → 1372), still #2 ---');
    console.log('Expected: Log score change, NO trade');
    await strategy.evaluate(createMockResult('Dec 19, 2025', [
        createMockModelData(1, 'gpt-4o-latest', 1390),
        createMockModelData(2, 'gemini-2.0-flash', 1372),  // Score down
        createMockModelData(3, 'claude-3-5-sonnet', 1370),
    ]));

    console.log('\n?? Trade Count:');
    const summary = strategy.getStateSummary() as any;
    console.log(`Executed Trades: ${summary.executedTradesCount} (Expected: 0)`);
}

async function testUnknownCompany() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST 9: Unknown Company/Model Handling');
    console.log('='.repeat(60));

    const executor = initMockExecutor();
    const strategy = new LMArenaTextStrategy(executor, { intervalMs: 1000 });
    strategy.setNotifier(initNotifier());

    // Initialize with unknown model
    console.log('\n--- Step 1: Initialize with unknown model at #3 ---');
    await strategy.evaluate(createMockResult('Dec 17, 2025', [
        createMockModelData(1, 'gpt-4o-latest', 1380),
        createMockModelData(2, 'gemini-2.0-flash', 1375),
        createMockModelData(3, 'mystery-model-x', 1370, 'Unknown Corp'),  // Unknown
    ]));

    // Unknown model takes #1
    console.log('\n--- Step 2: Unknown model takes #1 ---');
    console.log('Expected: Warning logged, trade skipped for unknown company');
    await strategy.evaluate(createMockResult('Dec 18, 2025', [
        createMockModelData(1, 'mystery-model-x', 1400, 'Unknown Corp'),
        createMockModelData(2, 'gpt-4o-latest', 1380),
        createMockModelData(3, 'gemini-2.0-flash', 1375),
    ]));

    console.log('\n?? State:');
    const summary = strategy.getStateSummary() as any;
    console.log(`Rank #1 Company: ${summary.rankStates[0]?.company}`);
}

async function testEmptyData() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST 10: Empty/Null Data Handling');
    console.log('='.repeat(60));

    const executor = initMockExecutor();
    const strategy = new LMArenaTextStrategy(executor, { intervalMs: 1000 });

    console.log('\n--- Test null data ---');
    const result1 = await strategy.evaluate(null);
    console.log(`Result: ${result1 ? 'Action' : 'No Action'} (Expected: No Action)`);

    console.log('\n--- Test empty modelRanks ---');
    const result2 = await strategy.evaluate({
        lastUpdated: 'Dec 17, 2025',
        totalVotes: 0,
        totalModels: 0,
        modelRanks: []
    });
    console.log(`Result: ${result2 ? 'Action' : 'No Action'} (Expected: No Action)`);
}

async function testComplexScenario() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST 11: Complex Multi-Day Scenario');
    console.log('='.repeat(60));

    const executor = initMockExecutor();
    const strategy = new LMArenaTextStrategy(executor, { intervalMs: 1000 });
    strategy.setNotifier(initNotifier());

    // Day 1: Initialize
    console.log('\n?? Day 1 (Dec 17): Initial State');
    await strategy.evaluate(createMockResult('Dec 17, 2025', [
        createMockModelData(1, 'gpt-4o-latest', 1380, 'OpenAI'),
        createMockModelData(2, 'gemini-2.0-flash-thinking-exp', 1375, 'Google'),
        createMockModelData(3, 'claude-3-5-sonnet-20241022', 1370, 'Anthropic'),
        createMockModelData(4, 'grok-2-1212', 1350, 'xAI'),
        createMockModelData(5, 'deepseek-v3', 1340, 'DeepSeek'),
    ]));

    // Day 2: New model enters, minor shuffle
    console.log('\n?? Day 2 (Dec 18): DeepSeek-R1 enters at #2');
    await strategy.evaluate(createMockResult('Dec 18, 2025', [
        createMockModelData(1, 'gpt-4o-latest', 1382, 'OpenAI'),
        createMockModelData(2, 'deepseek-r1', 1378, 'DeepSeek'),       // NEW!
        createMockModelData(3, 'gemini-2.0-flash-thinking-exp', 1376, 'Google'),
        createMockModelData(4, 'claude-3-5-sonnet-20241022', 1371, 'Anthropic'),
        createMockModelData(5, 'grok-2-1212', 1351, 'xAI'),
    ]));

    // Day 3: Major shake-up
    console.log('\n?? Day 3 (Dec 19): GPT-5 launches and takes #1');
    await strategy.evaluate(createMockResult('Dec 19, 2025', [
        createMockModelData(1, 'gpt-5-turbo', 1420, 'OpenAI'),         // NEW and #1!
        createMockModelData(2, 'gpt-4o-latest', 1382, 'OpenAI'),
        createMockModelData(3, 'deepseek-r1', 1378, 'DeepSeek'),
        createMockModelData(4, 'gemini-2.0-flash-thinking-exp', 1376, 'Google'),
        createMockModelData(5, 'claude-3-5-sonnet-20241022', 1371, 'Anthropic'),
    ]));

    // Day 4: Anthropic fights back
    console.log('\n?? Day 4 (Dec 20): Claude-4 launches, takes #1');
    await strategy.evaluate(createMockResult('Dec 20, 2025', [
        createMockModelData(1, 'claude-4-opus', 1450, 'Anthropic'),    // NEW and #1!
        createMockModelData(2, 'gpt-5-turbo', 1425, 'OpenAI'),
        createMockModelData(3, 'gpt-4o-latest', 1382, 'OpenAI'),
        createMockModelData(4, 'deepseek-r1', 1378, 'DeepSeek'),
        createMockModelData(5, 'gemini-2.0-flash-thinking-exp', 1376, 'Google'),
    ]));

    // Day 5: Stabilization
    console.log('\n?? Day 5 (Dec 21): Scores change but ranks stable');
    await strategy.evaluate(createMockResult('Dec 21, 2025', [
        createMockModelData(1, 'claude-4-opus', 1455, 'Anthropic'),
        createMockModelData(2, 'gpt-5-turbo', 1430, 'OpenAI'),
        createMockModelData(3, 'gpt-4o-latest', 1385, 'OpenAI'),
        createMockModelData(4, 'deepseek-r1', 1380, 'DeepSeek'),
        createMockModelData(5, 'gemini-2.0-flash-thinking-exp', 1378, 'Google'),
    ]));

    console.log('\n?? Final Summary:');
    const summary = strategy.getStateSummary() as any;
    console.log(`Known Models: ${summary.knownModelsCount}`);
    console.log(`Total Trades: ${summary.executedTradesCount}`);
    console.log('\nRank States:');
    summary.rankStates.forEach((state: any, i: number) => {
        console.log(`  #${i + 1}: ${state?.company} (${state?.modelName}) - ${state?.score}`);
    });
    console.log('\nTrade History:');
    Object.entries(summary.executedTrades).forEach(([key, trade]: [string, any]) => {
        console.log(`  ${key}: ${trade.side} @ ${trade.price} on ${trade.leaderboardVersion}`);
    });
}

// ==================== Main Runner ====================

async function runAllTests() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         LMArena Strategy Test Suite                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    try {
        await testInitialization();
        await testInvalidLastUpdated();
        await testRankChange();
        await testNewModelDetection();
        await testSameLeaderboardNoDuplicateTrade();
        await testLeaderboardUpdateAllowsRetrade();
        await testNoStyleControlStrategy();
        await testScoreChangeNoRankChange();
        await testUnknownCompany();
        await testEmptyData();
        await testComplexScenario();

        console.log('\n' + '='.repeat(60));
        console.log('? ALL TESTS COMPLETED');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n? TEST FAILED:', error);
        process.exit(1);
    }
}

// Run specific test or all
const testArg = process.argv[2];
if (testArg) {
    const testMap: Record<string, () => Promise<void>> = {
        'init': testInitialization,
        'invalid': testInvalidLastUpdated,
        'rank': testRankChange,
        'newmodel': testNewModelDetection,
        'nodupe': testSameLeaderboardNoDuplicateTrade,
        'retrade': testLeaderboardUpdateAllowsRetrade,
        'nostyle': testNoStyleControlStrategy,
        'score': testScoreChangeNoRankChange,
        'unknown': testUnknownCompany,
        'empty': testEmptyData,
        'complex': testComplexScenario,
    };

    if (testMap[testArg]) {
        testMap[testArg]().catch(console.error);
    } else {
        console.log(`Unknown test: ${testArg}`);
        console.log(`Available: ${Object.keys(testMap).join(', ')}`);
    }
} else {
    runAllTests().catch(console.error);
}