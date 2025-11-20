import TelegramBot from 'node-telegram-bot-api';
import { Notifier } from '../core/types';

export class TelegramNotifier implements Notifier {
    private bot: TelegramBot;
    private chatId: string;

    constructor(token: string, chatId: string) {
        this.bot = new TelegramBot(token, { polling: false });
        this.chatId = chatId;
    }

    async notify(message: string): Promise<void> {
        try {
            await this.bot.sendMessage(this.chatId, message);
            console.log(`[Telegram] Sent: ${message}`);
        } catch (error) {
            console.error('[Telegram] Failed to send message:', error);
        }
    }
}
