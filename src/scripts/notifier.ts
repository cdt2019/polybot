import { TelegramNotifier } from "../notifiers/TelegramNotifier";
import * as dotenv from 'dotenv';

dotenv.config();
async function main() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
        console.error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set');
        return;
    }
    const tgNotifier = new TelegramNotifier(token, chatId);

    await tgNotifier.notify("Hello Telegram!");
    console.log('Telegram notification sent.');
}

// BotFather /newbot 创建bot 获取到 token

// 浏览器打开 https://api.telegram.org/bot[token]/getUpdates
// 进去 bot 发些消息 
// 查看 chat :{id : xxxxxx}
main().catch(console.error);

