import puppeteer, { Browser, Page, HTTPRequest } from 'puppeteer';
import { Monitor, Notifier } from '../core/types';
import { logger } from '../core/logger';

export interface LiveBenchData {
    modelName: string;
    agenticCodingAverage: number;
    codingAverage: number;
    dataAnalysisAverage: number;
    IFAverage: number;
    languageAverage: number;
    mathematicsAverage: number;
    reasoningAverage: number;
}

export class LiveBenchMonitor implements Monitor<LiveBenchData[]> {
    private notifier?: Notifier;
    private url = 'https://livebench.ai/';
    private lastNotificationTime: number = 0;

    setNotifier(notifier: Notifier): void {
        this.notifier = notifier;
    }

    async poll(): Promise<LiveBenchData[]> {
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

    private parseCsvData(csvText: string): LiveBenchData[] {
        const lines = csvText.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length === 0) return [];

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        logger.info(`[LiveBenchMonitor] CSV Headers: ${headers.join(', ')}`);

        if (headers.length !== 21) {
            logger.error(`[LiveBenchMonitor] CSV has less than 21 columns. Headers: ${headers.join(', ')}.`);

            if (this.notifier) {
                const now = Date.now();
                if (now - this.lastNotificationTime > 3600000) { // 1 hour
                    this.notifier.notify('[LiveBenchMonitor] CSV has less than 21 columns. Headers: ' + headers.join(', '));
                    this.lastNotificationTime = now;
                }
            }
            return [];
        }

        const nameIndex = headers.indexOf('model');
        if (nameIndex == -1) {
            logger.error(`[LiveBenchMonitor] Could not find required columns in CSV. NameIdx: ${nameIndex}.`);
            return []
        }

        // reasoning average
        const theoryOfMindIndex = headers.indexOf('theory_of_mind');
        const zebraPuzzleIndex = headers.indexOf('zebra_puzzle');
        const spatialIndex = headers.indexOf('spatial');

        if (theoryOfMindIndex !== -1 && zebraPuzzleIndex !== -1 && spatialIndex !== -1) {
            logger.info(`[LiveBenchMonitor] Found 'theory_of_mind' (idx ${theoryOfMindIndex}), 'zebra_puzzle' (idx ${zebraPuzzleIndex}) and 'spatial' (idx ${spatialIndex}).`);
        } else {
            logger.error(`[LiveBenchMonitor] Could not find required columns in CSV. TheoryOfMind: ${theoryOfMindIndex}, ZebraPuzzle: ${zebraPuzzleIndex}, Spatial: ${spatialIndex}`);
            return []
        }

        // coding average
        const completionIndex = headers.indexOf('code_completion');
        const generationIndex = headers.indexOf('code_generation');

        if (completionIndex !== -1 && generationIndex !== -1) {
            logger.info(`[LiveBenchMonitor] Found 'code_completion' (idx ${completionIndex}) and 'code_generation' (idx ${generationIndex}).`);
        } else {
            logger.error(`[LiveBenchMonitor] Could not find required columns in CSV. Completion: ${completionIndex}, Generation: ${generationIndex}`);
            return []
        }

        // agentic Coding average
        const javascriptIndex = headers.indexOf('javascript');
        const typescriptIndex = headers.indexOf('typescript');
        const pythonIndex = headers.indexOf('python');
        if (javascriptIndex !== -1 && typescriptIndex !== -1 && pythonIndex !== -1) {
            logger.info(`[LiveBenchMonitor] Found 'javascript' (idx ${javascriptIndex}) and 'typescript' (idx ${typescriptIndex}) and 'python' (idx ${pythonIndex}).`);
        } else {
            logger.error(`[LiveBenchMonitor] Could not find required columns in CSV. JavaScript: ${javascriptIndex}, TypeScript: ${typescriptIndex}, Python: ${pythonIndex}.`);
            return []
        }

        // mathematics average
        const ampsHardIndex = headers.indexOf('amps_hard');
        const mathCompIndex = headers.indexOf('math_comp');
        const olympiadIndex = headers.indexOf('olympiad');

        if (ampsHardIndex !== -1 && mathCompIndex !== -1 && olympiadIndex !== -1) {
            logger.info(`[LiveBenchMonitor] Found 'amps_hard' (idx ${ampsHardIndex}), 'math_comp' (idx ${mathCompIndex}) and 'olympiad' (idx ${olympiadIndex}).`);
        } else {
            logger.error(`[LiveBenchMonitor] Could not find required columns in CSV. amps_hard: ${ampsHardIndex}, MathComp: ${mathCompIndex}, Olympiad: ${olympiadIndex}`);
            return []
        }

        // data analysis average
        const tableJoinIndex = headers.indexOf('tablejoin');
        const tableReformatIndex = headers.indexOf('tablereformat');

        if (tableJoinIndex !== -1 && tableReformatIndex !== -1) {
            logger.info(`[LiveBenchMonitor] Found 'tablejoin' (idx ${tableJoinIndex}) and 'tablereformat' (idx ${tableReformatIndex}).`);
        } else {
            logger.error(`[LiveBenchMonitor] Could not find required columns in CSV. TableJoin: ${tableJoinIndex}, TableReformat: ${tableReformatIndex}`);
            return []
        }

        // language average
        const connectionsIndex = headers.indexOf('connections');
        const plotUnscramblingIndex = headers.indexOf('plot_unscrambling');
        const typosIndex = headers.indexOf('typos');

        if (connectionsIndex !== -1 && plotUnscramblingIndex !== -1 && typosIndex !== -1) {
            logger.info(`[LiveBenchMonitor] Found 'connections' (idx ${connectionsIndex}), 'plot_unscrambling' (idx ${plotUnscramblingIndex}) and 'typos' (idx ${typosIndex}).`);
        } else {
            logger.error(`[LiveBenchMonitor] Could not find required columns in CSV. Connections: ${connectionsIndex}, PlotUnscrambling: ${plotUnscramblingIndex}, Typos: ${typosIndex}`);
            return []
        }

        // IF average
        const paraphraseIndex = headers.indexOf('paraphrase');
        const simplifyIndex = headers.indexOf('simplify');
        const storyGenerationIndex = headers.indexOf('story_generation');
        const summarizeIndex = headers.indexOf('summarize');

        if (paraphraseIndex !== -1 && simplifyIndex !== -1 && storyGenerationIndex !== -1 && summarizeIndex !== -1) {
            logger.info(`[LiveBenchMonitor] Found 'paraphrase' (idx ${paraphraseIndex}) and 'simplify' (idx ${simplifyIndex}) and 'story_generation' (idx ${storyGenerationIndex}) and 'summarize' (idx ${summarizeIndex}).`);
        } else {
            logger.error(`[LiveBenchMonitor] Could not find required columns in CSV. Paraphrase: ${paraphraseIndex}, Simplify: ${simplifyIndex}, StoryGeneration: ${storyGenerationIndex}, Summarize: ${summarizeIndex}`);
            return []
        }

        const models: LiveBenchData[] = [];
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',');
            if (parts.length < headers.length) continue;

            const name = parts[nameIndex].trim();

            // reasoning average
            let reasoningAverage = 0;
            const theoryOfMindScore = parseFloat(parts[theoryOfMindIndex]);
            const zebraPuzzleScore = parseFloat(parts[zebraPuzzleIndex]);
            const spatialScore = parseFloat(parts[spatialIndex]);
            if (!isNaN(theoryOfMindScore) && !isNaN(zebraPuzzleScore) && !isNaN(spatialScore)) {
                reasoningAverage = Math.round((theoryOfMindScore + zebraPuzzleScore + spatialScore) / 3 * 100) / 100;
            } else {
                reasoningAverage = NaN;
            }

            // coding average
            let codingAverage = 0;
            const compScore = parseFloat(parts[completionIndex]);
            const genScore = parseFloat(parts[generationIndex]);
            if (!isNaN(compScore) && !isNaN(genScore)) {
                codingAverage = Math.round((compScore + genScore) / 2 * 100) / 100;
            } else {
                codingAverage = NaN;
            }

            // agentic Coding average
            let agenticCodingAverage = 0;
            const agenticCompScore = parseFloat(parts[javascriptIndex]);
            const typescriptScore = parseFloat(parts[typescriptIndex]);
            const pythonScore = parseFloat(parts[pythonIndex]);
            if (!isNaN(agenticCompScore) && !isNaN(typescriptScore) && !isNaN(pythonScore)) {
                agenticCodingAverage = Math.round((agenticCompScore + typescriptScore + pythonScore) / 3 * 100) / 100;
            } else {
                agenticCodingAverage = NaN;
            }


            // mathematics average
            let mathematicsAverage = 0;
            const ampsHardScore = parseFloat(parts[ampsHardIndex]);
            const mathCompScore = parseFloat(parts[mathCompIndex]);
            const olympiadScore = parseFloat(parts[olympiadIndex]);
            if (!isNaN(ampsHardScore) && !isNaN(mathCompScore) && !isNaN(olympiadScore)) {
                mathematicsAverage = Math.round((ampsHardScore + mathCompScore + olympiadScore) / 3 * 100) / 100;
            } else {
                mathematicsAverage = NaN;
            }

            // data analysis average
            let dataAnalysisAverage = 0;
            const tableJoinScore = parseFloat(parts[tableJoinIndex]);
            const tableReformatScore = parseFloat(parts[tableReformatIndex]);
            if (!isNaN(tableJoinScore) && !isNaN(tableReformatScore)) {
                dataAnalysisAverage = Math.round((tableJoinScore + tableReformatScore) / 2 * 100) / 100;
            } else {
                dataAnalysisAverage = NaN;
            }


            // language average
            let languageAverage = 0;
            const connectionsScore = parseFloat(parts[connectionsIndex]);
            const plotUnscramblingScore = parseFloat(parts[plotUnscramblingIndex]);
            const typosScore = parseFloat(parts[typosIndex]);
            if (!isNaN(connectionsScore) && !isNaN(plotUnscramblingScore) && !isNaN(typosScore)) {
                languageAverage = Math.round((connectionsScore + plotUnscramblingScore + typosScore) / 3 * 100) / 100;
            } else {
                languageAverage = NaN;
            }

            // IF average
            let IFAverage = 0;
            const paraphraseScore = parseFloat(parts[paraphraseIndex]);
            const simplifyScore = parseFloat(parts[simplifyIndex]);
            const storyGenerationScore = parseFloat(parts[storyGenerationIndex]);
            const summarizeScore = parseFloat(parts[summarizeIndex]);
            if (!isNaN(paraphraseScore) && !isNaN(simplifyScore) && !isNaN(storyGenerationScore) && !isNaN(summarizeScore)) {
                IFAverage = Math.round((paraphraseScore + simplifyScore + storyGenerationScore + summarizeScore) / 4 * 100) / 100;
            } else {
                IFAverage = NaN;
            }

            models.push({
                modelName: name,
                reasoningAverage,
                codingAverage,
                agenticCodingAverage,
                mathematicsAverage,
                dataAnalysisAverage,
                languageAverage,
                IFAverage,
            });
        }

        //models.sort((a, b) => b.score - a.score);
        logger.info(`[LiveBenchMonitor] Parsed ${models.length} models via CSV. Load ${models.length} models.`);
        return models;
    }
}
