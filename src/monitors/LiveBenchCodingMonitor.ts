import puppeteer, { Browser, Page, HTTPRequest } from 'puppeteer';
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
        let browser = null;
        let page: Page | null = null;
        try {
            logger.info('[LiveBenchMonitor] Launching Puppeteer...');
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            page = await browser.newPage();

            // Optimize: Block images, stylesheets, fonts
            await page.setRequestInterception(true);
            page.on('request', (req: HTTPRequest) => {
                const resourceType = req.resourceType();
                if (['image', 'stylesheet', 'font', 'media', 'other'].includes(resourceType)) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            // Promisify the CSV response capture
            const csvDataPromise = new Promise<string>((resolve, reject) => {
                page!.on('response', async (response) => {
                    const url = response.url();
                    // Intercept table_*.csv
                    if (url.includes('table_') && url.endsWith('.csv')) {
                        logger.info(`[LiveBenchMonitor] Detected CSV file: ${url}`);
                        try {
                            const text = await response.text();
                            resolve(text);
                        } catch (e) {
                            reject(e);
                        }
                    }
                });
            });

            const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            await page.setUserAgent(userAgent);

            logger.info(`[LiveBenchMonitor] Navigating to ${this.url}...`);
            // Use domcontentloaded for faster "ready" state, trusting waitForSelector for the rest
            await page.goto(this.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Wait for CSV with a timeout
            try {
                const csvText = await Promise.race([
                    csvDataPromise,
                    new Promise<string>((_, reject) => setTimeout(() => reject(new Error('CSV timeout')), 15000))
                ]);

                logger.info('[LiveBenchMonitor] CSV downloaded successfully. Parsing...');
                return this.parseCsvData(csvText);

            } catch (e) {
                logger.error('[LiveBenchMonitor] CSV interception failed or timed out. Falling back to DOM scraping.', e);
            }
            return [];
            // // Fallback to DOM Scraping
            // await page.waitForSelector('table tbody tr', { timeout: 30000 });

            // const content = await page.content();
            // const $ = cheerio.load(content);

            // let codingIndex = -1;
            // let modelNameIndex = 0;

            // $('table thead th').each((i, el) => {
            //     const text = $(el).text().trim().toLowerCase();
            //     if (text.includes('coding') || text.includes('code')) {
            //         if (codingIndex === -1) {
            //             codingIndex = i;
            //             logger.info(`[LiveBenchMonitor] [DOM] Found Coding column at index ${i}: ${text}`);
            //         }
            //     }
            // });

            // if (codingIndex === -1) {
            //     logger.error('[LiveBenchMonitor] Could not find "Coding" column in table header.');
            //     return [];
            // }

            // const models: LiveBenchCodingData[] = [];

            // $('table tbody tr').each((_, tr) => {
            //     const tds = $(tr).find('td');
            //     if (tds.length === 0) return;

            //     const name = $(tds[modelNameIndex]).text().trim();
            //     const scoreText = $(tds[codingIndex]).text().trim();
            //     const score = parseFloat(scoreText);

            //     if (name && !isNaN(score)) {
            //         models.push({
            //             modelName: name,
            //             score: score
            //         });
            //     }
            // });

            // Sort by score descending
            // models.sort((a, b) => b.score - a.score);

            // logger.info(`[LiveBenchMonitor] Found ${models.length} models via DOM. Top: ${models[0]?.modelName} (${models[0]?.score})`);
            // return models;

        } catch (error) {
            logger.error('[LiveBenchMonitor] Error polling:', error);
            return [];
        } finally {
            if (page) {
                try {
                    await page.close();
                } catch (e) {
                    logger.debug(`Error closing page: ${e}`);
                }
            }
            if (browser) {
                try {
                    await browser.close();
                } catch (e) {
                    logger.debug(`Error closing browser: ${e}`);
                }
            }
        }
    }

    private parseCsvData(csvText: string): LiveBenchCodingData[] {
        const lines = csvText.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length === 0) return [];

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        logger.info(`[LiveBenchMonitor] CSV Headers: ${headers.join(', ')}`);

        const nameIndex = headers.indexOf('model');
        const completionIndex = headers.indexOf('code_completion');
        const generationIndex = headers.indexOf('code_generation');

        // Check if we have the specific columns for calculation
        // If not, fall back to looking for 'coding' or 'code' generic columns
        let useAverage = false;
        let singleScoreIndex = -1;

        if (completionIndex !== -1 && generationIndex !== -1) {
            useAverage = true;
            logger.info(`[LiveBenchMonitor] Found 'code_completion' (idx ${completionIndex}) and 'code_generation' (idx ${generationIndex}). Calculating average.`);
        } else {
            // Fallback
            logger.warn("[LiveBenchMonitor] Could not find both 'code_completion' and 'code_generation'. searching for generic 'coding' column.");
            useAverage = false;
            singleScoreIndex = headers.findIndex(h => h.includes('coding'));
            if (singleScoreIndex === -1) {
                singleScoreIndex = headers.findIndex(h => h.includes('code'));
            }
        }

        if (nameIndex === -1 || (!useAverage && singleScoreIndex === -1)) {
            logger.error(`[LiveBenchMonitor] Could not find required columns in CSV. NameIdx: ${nameIndex}, Completion: ${completionIndex}, Generation: ${generationIndex}`);
            return [];
        }

        if (!useAverage) { // Log the single column used
            logger.info(`[LiveBenchMonitor] Using Single CSV Column: '${headers[singleScoreIndex]}' for scores.`);
        }

        const models: LiveBenchCodingData[] = [];
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',');
            if (parts.length < headers.length) continue;

            const name = parts[nameIndex].trim();
            let finalScore = 0;

            if (useAverage) {
                const compScore = parseFloat(parts[completionIndex]);
                const genScore = parseFloat(parts[generationIndex]);
                if (!isNaN(compScore) && !isNaN(genScore)) {
                    finalScore = (compScore + genScore) / 2;
                } else {
                    finalScore = NaN;
                }
            } else {
                finalScore = parseFloat(parts[singleScoreIndex]);
            }

            // Normalization if stuck in 0-1 range (though data example shows >1)
            // Example data: 76.087. So likely 0-100 scale already.
            // But logic at line 183 handles 0-1 conversion.
            if (!isNaN(finalScore)) {
                if (finalScore <= 1.0 && finalScore > 0) {
                    finalScore = finalScore * 100;
                }
            }

            if (name && !isNaN(finalScore)) {
                // Round to 2 decimal places
                finalScore = parseFloat(finalScore.toFixed(2));

                models.push({
                    modelName: name,
                    score: finalScore
                });
            }
        }

        models.sort((a, b) => b.score - a.score);
        logger.info(`[LiveBenchMonitor] Parsed ${models.length} models via CSV. Top: ${models[0]?.modelName} (${models[0]?.score})`);
        return models;
    }
}
