import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { Monitor, Notifier } from '../core/types';
import { logger } from '../core/logger';

export interface TrendingItem {
    rank: number;
    name: string;
}

export interface TrendingCategory {
    category: string;
    items: TrendingItem[];
}

export interface TrendingSection {
    section: string;
    categories: TrendingCategory[];
}

export interface GoogleTrendsData {
    sections: TrendingSection[];
}

export class GoogleTrendsMonitor implements Monitor<GoogleTrendsData | null> {
    private notifier?: Notifier;
    private url: string;

    private allow2024: boolean;
    private latestData: GoogleTrendsData | null = null;

    constructor(url: string = 'https://trends.withgoogle.com/year-in-search/2025/', allow2024: boolean = false) {
        this.url = url;
        this.allow2024 = allow2024;
    }

    setNotifier(notifier: Notifier): void {
        this.notifier = notifier;
    }

    async poll(): Promise<GoogleTrendsData | null> {
        let browser;
        try {
            logger.info('[GoogleTrendsMonitor] Launching Puppeteer...');
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();

            // Set a realistic user agent
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            logger.info(`[GoogleTrendsMonitor] Navigating to ${this.url}...`);
            let response = await page.goto(this.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // Check if redirected to 2024 or 404
            if (response?.status() !== 200) {
                logger.warn('[GoogleTrendsMonitor] Navigation failed with status: ' + response?.status());
                return null;
            } else {
                this.notifier?.notify(`Navigated to ${this.url} with status: ` + response?.status());
            }

            const currentUrl = page.url();
            if (currentUrl.includes('2024') && !this.allow2024) {
                logger.info('[GoogleTrendsMonitor] Redirected to 2024 page, 2025 not released yet.');
                return null;
            }

            if (!currentUrl.includes('2025') && !this.allow2024) {
                logger.info(`[GoogleTrendsMonitor] Current URL is ${currentUrl}, not 2025.`);
                return null;
            }

            // Scroll down to trigger lazy loading
            logger.info('[GoogleTrendsMonitor] Scrolling down to load content...');
            await page.evaluate(async () => {
                await new Promise<void>((resolve) => {
                    let totalHeight = 0;
                    const distance = 100;
                    const timer = setInterval(() => {
                        const scrollHeight = document.body.scrollHeight;
                        window.scrollBy(0, distance);
                        totalHeight += distance;

                        if (totalHeight >= scrollHeight || totalHeight > 10000) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 100);
                });
            });

            // Wait for content
            try {
                await page.waitForSelector('.glue-card__list-item', { timeout: 10000 });
            } catch (e) {
                logger.warn('[GoogleTrendsMonitor] Timeout waiting for list items, checking content...');
            }

            const content = await page.content();
            const $ = cheerio.load(content);

            // Parse the complete hierarchical structure
            const parsedData = this.parseCompleteStructure($);
            this.latestData = parsedData;

            // Log the complete structure
            this.logStructure(parsedData);

            // Return the complete data structure for strategy to process
            if (parsedData.sections.length > 0) {
                logger.info(`[GoogleTrendsMonitor] Successfully parsed ${parsedData.sections.length} sections`);
                return parsedData;
            }

            logger.warn('[GoogleTrendsMonitor] No data found.');
            return null;

        } catch (error) {
            logger.error('Error polling Google Trends:', error);
            return null;
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }

    private parseCompleteStructure($: cheerio.CheerioAPI): GoogleTrendsData {
        const sections: TrendingSection[] = [];

        // Find all expansion panels (sections like Trending, Entertainment, Sports, etc.)
        $('.glue-expansion-panel').each((_, panelElement) => {
            const sectionName = $(panelElement).find('.glue-expansion-panel__header-text').first().text().trim();

            // Skip empty section names
            if (!sectionName) return;

            logger.info(`[GoogleTrendsMonitor] Found section: ${sectionName}`);

            // Find all categories within this section
            const categories: TrendingCategory[] = [];

            // Look for all card containers within this expansion panel
            $(panelElement).find('.card-container').each((_, cardElement) => {
                const categoryTitle = $(cardElement).find('h4.list-title').first().text().trim();

                if (!categoryTitle) return;

                // Extract items from this category
                const items: TrendingItem[] = [];
                let rank = 1;

                $(cardElement).find('li.glue-card__list-item').each((_, itemElement) => {
                    const itemName = $(itemElement).find('h4').first().text().trim();
                    if (itemName) {
                        items.push({
                            rank: rank++,
                            name: itemName
                        });
                    }
                });

                if (items.length > 0) {
                    categories.push({
                        category: categoryTitle,
                        items: items
                    });
                }
            });

            if (categories.length > 0) {
                sections.push({
                    section: sectionName,
                    categories: categories
                });
            }
        });

        return { sections };
    }

    private logStructure(data: GoogleTrendsData): void {
        logger.info('[GoogleTrendsMonitor] ========== Complete Structure ==========');

        data.sections.forEach(section => {
            logger.info(`[GoogleTrendsMonitor] ${section.section}`);

            section.categories.forEach(category => {
                logger.info(`[GoogleTrendsMonitor]   ${category.category}`);

                // Log first 5 items
                category.items.slice(0, 5).forEach(item => {
                    logger.info(`[GoogleTrendsMonitor]     ${item.rank}. ${item.name}`);
                });

                if (category.items.length > 5) {
                    logger.info(`[GoogleTrendsMonitor]     ... and ${category.items.length - 5} more`);
                }
            });
        });

        logger.info('[GoogleTrendsMonitor] =====================================');
    }
}
