import { TelegramNotifier } from "../notifiers/TelegramNotifier";

async function main() {
    const token = 'token';
    const chatId = '11111';
    const tgNotifier = new TelegramNotifier(token, chatId);

    await tgNotifier.notify("Hello Telegram!");
    console.log('Telegram notification sent.');
}

// BotFather /newbot 创建bot 获取到 token

// 浏览器打开 https://api.telegram.org/bot[token]/getUpdates
// 进去 bot 发些消息 
// 查看 chat :{id : xxxxxx}
main().catch(console.error);

