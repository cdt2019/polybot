import puppeteer from 'puppeteer';
import { Monitor, Notifier } from '../core/types';
import { logger } from '../core/logger';

export interface LMArenaData {
    rank: number;
    rankSpread: string;
    modelName: string;
    score: number;
    confidenceInterval: string;
    votes: number;
    organization: string;
    license: string;
}

export interface LMArenaResult {
    lastUpdated: string;
    totalVotes: number;
    totalModels: number;
    modelRanks: LMArenaData[]; // We keep using LMArenaData for the row items, but remove lastUpdated if we want to be clean, or just ignore it.
}

export class LMArenaTextMonitor implements Monitor<LMArenaResult> {
    protected notifier?: Notifier;
    protected url = 'https://lmarena.ai/leaderboard/text';

    setNotifier(notifier: Notifier): void {
        this.notifier = notifier;
    }

    async poll(): Promise<LMArenaResult> {
        let browser;
        try {
            logger.info('[LMArenaTextMonitor] Launching Puppeteer...');
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            logger.info(`[LMArenaTextMonitor] Navigating to ${this.url}...`);
            await page.goto(this.url, { waitUntil: 'networkidle2', timeout: 60000 });

            try {
                // Wait specifically for the table, increase timeout slightly
                await page.waitForSelector('table tbody tr', { timeout: 60000 });
            } catch (e) {
                logger.warn('[LMArenaTextMonitor] Timeout waiting for table rows, proceeding anyway...');
            }

            // Extract Header Metadata
            const metadata = await page.evaluate(() => {
                const findValue = (labelText: string) => {
                    const ps = Array.from(document.querySelectorAll('p'));
                    const label = ps.find(p => p.textContent?.includes(labelText));
                    if (label && label.parentElement) {
                        const siblings = Array.from(label.parentElement.querySelectorAll('p'));
                        const valueEl = siblings.find(el => el !== label);
                        return valueEl ? valueEl.innerText.trim() : '';
                    }
                    return '';
                };

                return {
                    lastUpdated: findValue('Last Updated'),
                    totalVotes: findValue('Total Votes'),
                    totalModels: findValue('Total Models')
                };
            });

            // Use evaluate to parse DOM structure using strict column indices
            // Based on analysis:
            // Col 0: Rank
            // Col 1: Rank Spread (e.g. 1 <-> 2)
            // Col 2: Model Name (inside a > span.inline-block)
            // Col 3: Score
            // Col 4: CI
            // Col 5: Votes
            // Col 6: Organization
            // Col 7: License
            const data = await page.evaluate(() => {
                const results: any[] = [];
                const rows = Array.from(document.querySelectorAll('table tbody tr'));

                for (const row of rows) {
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 8) continue; // Ensure we have enough columns

                    // Helper to safely get text
                    const getText = (el: Element | null) => el ? (el as HTMLElement).innerText.trim() : '';
                    const getCellText = (colIndex: number, selector: string = 'span') => {
                        const cell = cells[colIndex];
                        if (!cell) return '';
                        const target = cell.querySelector(selector);
                        return getText(target);
                    };

                    // 1. Rank (Col 0)
                    const rankText = getCellText(0, 'span');
                    const rank = parseInt(rankText) || 0;

                    // 2. Rank Spread (Col 1)
                    // Structure: span(lower) ... span(upper)
                    // We can just grab the whole text of the cell usually, or specific spans
                    let rankSpread = '';
                    const spreadCell = cells[1];
                    if (spreadCell) {
                        // Try to get specific spans if they exist
                        const spans = spreadCell.querySelectorAll('span');
                        // Usually: [0]=lower, [1]=arrow, [2]=upper  OR just [0] if no spread
                        // But let's just use the raw text and clean it
                        rankSpread = (spreadCell as HTMLElement).innerText.trim().replace(/\n/g, '');
                    }

                    // 3. Model Name (Col 2)
                    // Strict path: a > span.inline-block
                    // This avoids the Organization prefix if it exists elsewhere in the cell
                    const modelName = getCellText(2, 'a span.inline-block');

                    // 4. Score (Col 3)
                    const scoreText = getCellText(3, 'span');
                    const score = parseInt(scoreText) || 0;

                    // 5. CI (Col 4)
                    const ciText = getCellText(4, 'span'); // "±6"

                    // 6. Votes (Col 5)
                    const votesText = getCellText(5, 'span');
                    const votes = parseInt(votesText.replace(/,/g, '')) || 0;

                    // 7. Organization (Col 6)
                    const organization = getCellText(6, 'span');

                    // 8. License (Col 7)
                    const license = getCellText(7, 'span');

                    results.push({
                        rank,
                        rankSpread,
                        modelName,
                        score,
                        confidenceInterval: ciText,
                        votes,
                        organization,
                        license
                    });
                }
                return results;
            });

            // Post-processing
            const models: LMArenaData[] = data.map((d: any) => ({
                rank: d.rank,
                rankSpread: d.rankSpread,
                modelName: d.modelName,
                score: d.score,
                confidenceInterval: d.confidenceInterval,
                votes: d.votes,
                organization: d.organization,
                license: d.license,
            }));


            // If rank is still missing/0, fallback to index
            // models.sort((a, b) => b.score - a.score);
            // models.forEach((m, index) => {
            //     if (m.rank === 0) m.rank = index + 1;
            // });

            const top20 = models.slice(0, 20);

            logger.info(`[LMArenaTextMonitor] Found ${models.length} distinct models, returning top ${top20.length}`);

            return {
                lastUpdated: metadata.lastUpdated,
                totalVotes: parseInt(metadata.totalVotes.replace(/,/g, '')) || 0,
                totalModels: parseInt(metadata.totalModels.replace(/,/g, '')) || 0,
                modelRanks: top20
            };

        } catch (error) {
            logger.error('Error polling LMArena leaderboard:', error);
            return {
                lastUpdated: '',
                totalVotes: 0,
                totalModels: 0,
                modelRanks: []
            };
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }
}
