import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { Monitor, Notifier } from '../core/types';
import { logger } from '../core/logger';

export interface HLEData {
    modelName: string;
    score: number;
}

export class HLEMonitor implements Monitor<HLEData | null> {
    private notifier?: Notifier;

    // Using the main leaderboard page
    private url = 'https://scale.com/leaderboard/humanitys_last_exam';
    // Regex to match "gemini" followed by "3" (case insensitive), allowing for variants like "gemini-3-pro", "Gemini 3 Ultra", etc.
    // It ensures "3" is the main version number, not part of a date or minor version if possible.
    // Matches: "gemini-3", "Gemini 3", "gemini-3-pro", "google-gemini-3"
    // Does NOT match: "gemini-2.5", "gemini-1.5"
    private targetModelRegex = /gemini[- ]?3/i;

    setNotifier(notifier: Notifier): void {
        this.notifier = notifier;
    }

    async poll(): Promise<HLEData | null> {
        let browser;
        try {
            console.log('[HLEMonitor] Launching Puppeteer...');
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();

            // Set a realistic user agent
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            logger.info(`[HLEMonitor] Navigating to ${this.url}...`);
            await page.goto(this.url, { waitUntil: 'networkidle2', timeout: 60000 });

            // Wait for some content to load
            await page.waitForSelector('p', { timeout: 10000 });

            // Get page content
            const content = await page.content();
            const $ = cheerio.load(content);

            // We need to iterate over all model elements to find one that matches our regex
            // The models seem to be in <p> tags with a title attribute or text content

            interface MatchResult {
                modelName: string;
                score: number;
            }

            let bestMatch: MatchResult | null = null;

            // Select all p tags that might contain model names
            // This is a broad selector, we'll filter in the loop
            const potentialModels = $('p');

            potentialModels.each((_, element) => {
                const el = $(element);
                const title = el.attr('title');
                const text = el.text().trim();

                // Check title first, then text
                const modelNameCandidate = title || text;

                if (modelNameCandidate && this.targetModelRegex.test(modelNameCandidate)) {
                    // Found a potential match!
                    // Now try to find the score associated with this element
                    const parent = el.parent().parent().parent();
                    const parentText = parent.text();

                    // Look for score pattern: "37.52±1.90" -> extract 37.52
                    const scoreMatch = parentText.match(/(\d+\.\d+)±/);

                    if (scoreMatch) {
                        const score = parseFloat(scoreMatch[1]);
                        logger.info(`[HLEMonitor] Found matching model: ${modelNameCandidate}, Score: ${score}`);

                        // If we have multiple matches (e.g. "Gemini 3 Pro" and "Gemini 3 Flash"), 
                        // we might want the highest score or a specific one.
                        // For now, let's take the first one or the highest score if we find multiple?
                        // Let's assume we want the highest score if multiple Gemini 3 models appear.
                        if (!bestMatch || score > bestMatch.score) {
                            bestMatch = {
                                modelName: modelNameCandidate,
                                score: score
                            };
                        }
                    }
                }
            });

            if (bestMatch) {
                // TypeScript needs help here to know bestMatch is not null/never
                const match = bestMatch as MatchResult;
                logger.info(`[HLEMonitor] Best match selected: ${match.modelName} with score ${match.score}`);
                return match;
            } else {
                logger.info(`[HLEMonitor] No model matching ${this.targetModelRegex} found on page.`);
            }

            return null;
        } catch (error) {
            logger.error('Error polling HLE leaderboard:', error);
            return null;
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }
}
