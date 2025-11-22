import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { Monitor, Notifier } from '../core/types';
import { logger } from '../core/logger';

export interface LMArenaData {
    modelName: string;
    score: number;
}

export class LMArenaMonitor implements Monitor<LMArenaData | null> {
    private notifier?: Notifier;

    // Using the main leaderboard page
    private url = 'https://lmarena.ai/leaderboard/text';

    // Regex to match "gemini" followed by "3" (case insensitive)
    private targetModelRegex = /gemini[- ]?3/i;

    setNotifier(notifier: Notifier): void {
        this.notifier = notifier;
    }

    async poll(): Promise<LMArenaData | null> {
        let browser;
        try {
            logger.info('[LMArenaMonitor] Launching Puppeteer...');
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();

            // Set a realistic user agent
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            logger.info(`[LMArenaMonitor] Navigating to ${this.url}...`);
            await page.goto(this.url, { waitUntil: 'networkidle2', timeout: 60000 });

            // Wait for some content to load - the table usually takes a moment
            // Looking for a table or specific class that indicates the leaderboard is loaded
            // Based on typical structure, waiting for 'table' or a specific div might be good.
            // Let's wait for 'body' first, then maybe a specific element if we knew it.
            // Waiting for text "Arena Score" might be safer if classes change.
            try {
                await page.waitForSelector('div', { timeout: 10000 });
            } catch (e) {
                logger.warn('[LMArenaMonitor] Timeout waiting for specific selector, proceeding with content...');
            }

            // Get page content
            const content = await page.content();
            const $ = cheerio.load(content);

            interface MatchResult {
                modelName: string;
                score: number;
            }

            let bestMatch: MatchResult | null = null;

            // The leaderboard is likely in a table or a grid of divs.
            // We'll search through all text nodes or specific elements.
            // A robust way without knowing exact classes is to look for the model name 
            // and then find the score nearby.

            // Strategy: Find elements containing the model name, then look for the score in the same row/container.

            // Let's try to find all elements that might contain the model name.
            // 'div', 'span', 'p', 'td' are likely candidates.
            const potentialElements = $('div, span, p, td, a');

            potentialElements.each((_, element) => {
                const el = $(element);
                const text = el.text().trim();

                if (text && this.targetModelRegex.test(text)) {
                    // Found a potential match!
                    // Now we need to find the score. 
                    // The score is usually in a sibling element or parent's sibling.
                    // Or we can look at the whole row text.

                    // Let's try to get the parent row (tr) or container (div)
                    // and search for the score pattern within that container.

                    // Go up a few levels to find a container that might have the score
                    let container = el.parent();
                    let containerText = container.text();

                    // If the container text is too short, maybe go up one more level
                    if (containerText.length < 50) {
                        container = container.parent();
                        containerText = container.text();
                    }
                    if (containerText.length < 50) {
                        container = container.parent();
                        containerText = container.text();
                    }

                    // Look for score pattern: number usually between 1000 and 1500 for Arena score?
                    // Or maybe it's like "1234" or "1234.56"
                    // The prompt example showed: "1500+ 47%" which implies scores are around 1500.
                    // Let's look for a number > 1000.

                    // Regex for a score: look for 4 digits, maybe with decimal.
                    // Avoid years like 2024, 2025.
                    // But wait, the prompt says "Arena Score".

                    // Let's try to find a number that looks like a score.
                    // Simple heuristic: look for the first number > 800 (since ELOs are usually high) 
                    // that is NOT a year (so maybe exclude 2023-2030 if possible, or context matters).

                    // Actually, let's look for the specific column if possible, but we don't know the index.

                    // Let's try to find all numbers in the container.
                    const numbers = containerText.match(/\d{3,4}/g);

                    if (numbers) {
                        for (const numStr of numbers) {
                            const num = parseInt(numStr);
                            // ELO scores are typically 800-1400+. 
                            // Years are 2020+. 
                            // If we see 1500+, it could be a score or a year.
                            // But usually scores are the main numbers next to the name.

                            if (num > 800 && num < 2000) {
                                // Plausible score.
                                // If we have multiple, the highest one might be the score (or the upper bound).
                                // But usually there's just one score column.

                                // Let's log what we found
                                // logger.info(`[LMArenaMonitor] Candidate for ${text}: ${num}`);

                                if (!bestMatch || num > bestMatch.score) {
                                    bestMatch = {
                                        modelName: text,
                                        score: num
                                    };
                                }
                            }
                        }
                    }
                }
            });

            if (bestMatch) {
                const match = bestMatch as MatchResult;
                logger.info(`[LMArenaMonitor] Best match selected: ${match.modelName} with score ${match.score}`);
                return match;
            } else {
                logger.info(`[LMArenaMonitor] No model matching ${this.targetModelRegex} found on page.`);
            }

            return null;
        } catch (error) {
            logger.error('Error polling LMArena leaderboard:', error);
            return null;
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }
}
