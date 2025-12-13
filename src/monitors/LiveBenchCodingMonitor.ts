import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { Monitor, Notifier } from '../core/types';
import { logger } from '../core/logger';

export interface LiveBenchCodingData {
    modelName: string;
    score: number;
}

export class LiveBenchCodingMonitor implements Monitor<LiveBenchCodingData[]> {
    private notifier?: Notifier;
    private url = 'https://livebench.ai/';

    setNotifier(notifier: Notifier): void {
        this.notifier = notifier;
    }

    async poll(): Promise<LiveBenchCodingData[]> {
        let browser;
        try {
            logger.info('[LiveBenchMonitor] Launching Puppeteer...');
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            logger.info(`[LiveBenchMonitor] Navigating to ${this.url}...`);
            await page.goto(this.url, { waitUntil: 'networkidle2', timeout: 60000 });

            await page.waitForSelector('table tbody tr', { timeout: 15000 });

            const content = await page.content();
            const $ = cheerio.load(content);

            let codingIndex = -1;
            let modelNameIndex = 0;

            $('table thead th').each((i, el) => {
                const text = $(el).text().trim().toLowerCase();
                if (text.includes('coding') || text.includes('code')) {
                    if (codingIndex === -1) {
                        codingIndex = i;
                        logger.info(`[LiveBenchMonitor] Found Coding column at index ${i}: ${text}`);
                    }
                }
            });

            if (codingIndex === -1) {
                logger.error('[LiveBenchMonitor] Could not find "Coding" column in table header.');
                return [];
            }

            const models: LiveBenchCodingData[] = [];

            $('table tbody tr').each((_, tr) => {
                const tds = $(tr).find('td');
                if (tds.length === 0) return;

                const name = $(tds[modelNameIndex]).text().trim();
                const scoreText = $(tds[codingIndex]).text().trim();
                const score = parseFloat(scoreText);

                if (name && !isNaN(score)) {
                    models.push({
                        modelName: name,
                        score: score
                    });
                }
            });

            // Sort by score descending
            models.sort((a, b) => b.score - a.score);

            logger.info(`[LiveBenchMonitor] Found ${models.length} models. Top: ${models[0]?.modelName} (${models[0]?.score})`);
            return models;

        } catch (error) {
            logger.error('[LiveBenchMonitor] Error polling:', error);
            return [];
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }
}
