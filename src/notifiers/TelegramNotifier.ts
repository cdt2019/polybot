import TelegramBot from 'node-telegram-bot-api';
import { Notifier } from '../core/types';
import { logger } from '../core/logger';

export class TelegramNotifier implements Notifier {
    private bot: TelegramBot;
    private chatId: string;

    constructor(token: string, chatId: string) {
        this.bot = new TelegramBot(token, { polling: false });
        this.chatId = chatId;
    }

    async notify(message: string): Promise<void> {
        try {
            const MAX_LENGTH = 1000;
            let msgToSend = message;
            if (message.length > MAX_LENGTH) {
                msgToSend = message.substring(0, MAX_LENGTH) + '\n... (truncated)';
            }
            await this.bot.sendMessage(this.chatId, msgToSend);
            logger.info(`[Telegram] Sent: ${msgToSend}`);
        } catch (error) {
            logger.error('[Telegram] Failed to send message:', error);
        }
    }

}
