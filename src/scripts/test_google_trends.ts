import { GoogleTrendsMonitor } from '../monitors/GoogleTrendsMonitor';
import { TelegramNotifier } from '../notifiers/TelegramNotifier';
import { logger } from '../core/logger';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
    logger.info('Starting Google Trends Test...');

    const monitor = new GoogleTrendsMonitor('https://trends.withgoogle.com/year-in-search/2024/', true);
    //const notifier = new ConsoleNotifier();

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
        console.error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set');
        return;
    }
    const notifier = new TelegramNotifier(token, chatId);

    monitor.setNotifier(notifier);

    const result = await monitor.poll();
    logger.info(`Poll result (top person): ${result}`);

    if (result) {
        // Write to file for inspection
        // fs.writeFileSync('google_trends_structure.json', JSON.stringify(result, null, 2));
        // logger.info('Full structure saved to google_trends_structure.json');

        // Print summary
        logger.info('\n========== SUMMARY ==========');
        result.sections.forEach(section => {
            logger.info(`\n${section.section}:`);
            section.categories.forEach(category => {
                logger.info(`  ${category.category}: ${category.items.length} items`);
                logger.info(`    Top 5: ${category.items.slice(0, 5).map(i => i.name).join(', ')}`);
            });
        });
    }
}

main().catch(e => console.error(e));
