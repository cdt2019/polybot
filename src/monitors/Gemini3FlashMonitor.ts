import { GoogleGenAI } from '@google/genai';
import { Monitor, Notifier } from '../core/types';
import { logger } from '../core/logger';
import * as dotenv from 'dotenv';

dotenv.config();

export class Gemini3FlashMonitor implements Monitor<boolean> {
    private notifier?: Notifier;
    private genai: GoogleGenAI;

    constructor() {
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            throw new Error('GOOGLE_API_KEY is not set');
        }
        this.genai = new GoogleGenAI({ apiKey });
    }

    setNotifier(notifier: Notifier): void {
        this.notifier = notifier;
    }

    async poll(): Promise<boolean> {
        try {
            logger.info('[GeminiReleaseMonitor] Checking for Gemini 3.0 Flash release...');

            // List models
            const response = await this.genai.models.list({ config: { pageSize: 100 } });

            if (!response.page) {
                logger.warn('[GeminiReleaseMonitor] No models returned from API.');
                return false;
            }

            const foundModels = response.page.filter(model => {
                const name = model.name?.toLowerCase() || '';
                const displayName = model.displayName?.toLowerCase() || '';

                // Check for "gemini-3.0-flash", "gemini-3-flash" or similar variations
                // Regex: gemini followed by optional separator, then 3 or 3.0, then optional separator, then flash
                const regex = /gemini[-_]?(3|3\.0)[-_]?flash/i;

                return regex.test(name) || regex.test(displayName);
            });

            if (foundModels.length > 0) {
                const modelNames = foundModels.map(m => m.name).join(', ');
                const msg = `[Gemini3FlashMonitor] Gemini 3.0 Flash FOUND! Models: ${modelNames}`;
                logger.info(msg);
                if (this.notifier) {
                    await this.notifier.notify(msg);
                }
                return true;
            } else {
                logger.info('[Gemini3FlashMonitor] Gemini 3.0 Flash not found yet.');
                return false;
            }

        } catch (error) {
            logger.error('Error polling Gemini models:', error);
            return false;
        }
    }
}
