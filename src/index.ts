import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { Bot } from './core/Bot';
import { PolymarketExecutor } from './executors/PolymarketExecutor';
import { ConsoleNotifier } from './notifiers/ConsoleNotifier';
import { TelegramNotifier } from './notifiers/TelegramNotifier';
import { Notifier, Monitor, Strategy, BotConfig } from './core/types';
import { logger } from './core/logger';
import { loadPrivateKey } from './core/wallet';

dotenv.config();

function parseArgs() {
    const args = process.argv.slice(2);
    const params: Record<string, string> = {};
    args.forEach(arg => {
        const [key, value] = arg.split('=');
        if (key.startsWith('--')) {
            params[key.substring(2)] = value;
        }
    });
    return params;
}

async function findClassInDir(dir: string, className: string): Promise<any | null> {
    if (!fs.existsSync(dir)) return null;

    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            continue;
        }

        if (file.endsWith('.js')) {
            try {
                const module = await import(fullPath);
                if (module[className]) {
                    logger.debug(`Found ${className} in ${fullPath}`);
                    return module[className];
                }
            } catch (e) {
                // Ignore load errors for unrelated files
            }
        }
    }
    return null;
}

async function loadModule<T>(moduleInput: string): Promise<new (...args: any[]) => T> {
    // Case 1: Path provided (contains separator or extension)
    if (moduleInput.includes('/') || moduleInput.includes('\\') || moduleInput.endsWith('.ts') || moduleInput.endsWith('.js')) {
        let modulePath = moduleInput;
        let className: string | undefined;

        if (moduleInput.includes(':')) {
            const parts = moduleInput.split(':');
            modulePath = parts[0];
            className = parts[1];
        }

        // Convert src/X.ts to dist/X.js if running in node
        let loadPath = modulePath;
        if (modulePath.endsWith('.ts')) {
            loadPath = modulePath.replace(/^src/, 'dist').replace(/\.ts$/, '.js');
        }

        const absolutePath = path.resolve(process.cwd(), loadPath);
        logger.info(`Loading module from: ${absolutePath}`);

        try {
            const module = await import(absolutePath);

            if (className) {
                if (module[className]) {
                    logger.info(`Found specified class: ${className}`);
                    return module[className];
                } else {
                    throw new Error(`Class '${className}' not found in module ${modulePath}`);
                }
            }

            for (const key in module) {
                if (typeof module[key] === 'function' && /^[A-Z]/.test(key)) {
                    logger.info(`Found class (auto-detected): ${key}`);
                    return module[key];
                }
            }
            throw new Error(`No class found in module ${modulePath}`);
        } catch (error) {
            logger.error(`Failed to load module ${modulePath}:`, error);
            process.exit(1);
        }
    }

    // Case 2: Class Name only provided
    else {
        const className = moduleInput;
        logger.info(`Searching for class: ${className}...`);

        const searchDirs = [
            path.resolve(process.cwd(), 'dist'),
            path.resolve(process.cwd(), 'dist/monitors'),
            path.resolve(process.cwd(), 'dist/strategies')
        ];

        for (const dir of searchDirs) {
            const foundClass = await findClassInDir(dir, className);
            if (foundClass) return foundClass;
        }

        logger.error(`Could not find class '${className}' in search directories.`);
        process.exit(1);
    }
}

async function main() {
    logger.info('Starting Polybot...');
    const args = parseArgs();

    // Initialize Notifier
    let notifier: Notifier;
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        logger.info('Using Telegram Notifier');
        notifier = new TelegramNotifier(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID);
    } else {
        logger.info('Using Console Notifier (Telegram config missing)');
        notifier = new ConsoleNotifier();
    }

    // Initialize Executor
    const executor = new PolymarketExecutor(await loadPrivateKey(), notifier);

    // Validate required arguments
    if (!args['monitor'] || !args['strategy']) {
        logger.error('Error: --monitor and --strategy arguments are required.');
        logger.error('Example: node dist/index.js --monitor=HLEMonitor --strategy=Gemini3HLEStrategy');
        process.exit(1);
    }

    // Parse Interval (in seconds)
    const intervalSeconds = parseInt(args['interval'] || process.env.MONITOR_INTERVAL || '60', 10);
    const intervalMs = intervalSeconds * 1000;
    logger.info(`Bot Interval: ${intervalSeconds}s (${intervalMs}ms)`);

    // Dynamic Monitor Loading
    const monitorPath = args['monitor'];
    const MonitorClass = await loadModule<Monitor<any>>(monitorPath);
    const monitor = new MonitorClass();
    if (monitor.setNotifier) {
        monitor.setNotifier(notifier);
    }
    logger.info(`Initialized Monitor from ${monitorPath}`);

    // Create BotConfig
    const botConfig: BotConfig = {
        intervalMs: intervalMs,
        orderSize: (args['orderSize'] || process.env.ORDER_SIZE) ?
            parseFloat(args['orderSize'] || process.env.ORDER_SIZE || "10") : undefined,
        orderType: (args['orderType'] || process.env.ORDER_TYPE) ?
            ((args['orderType'] || process.env.ORDER_TYPE || "MARKET").toUpperCase() as 'LIMIT' | 'MARKET') : undefined,
        orderPrice: (args['orderPrice'] || process.env.ORDER_PRICE) ?
            parseFloat(args['orderPrice'] || process.env.ORDER_PRICE || "0.9") : undefined,
        timeInForce: (args['timeInForce'] || process.env.TIME_IN_FORCE) ?
            ((args['timeInForce'] || process.env.TIME_IN_FORCE || "FAK").toUpperCase() as 'GTD' | 'GTC' | 'FOK' | 'FAK') : undefined,
        ...args // Spread other args if needed
    };

    // Dynamic Strategy Loading
    const strategyPath = args['strategy'];
    const StrategyClass = await loadModule<Strategy<any>>(strategyPath);
    // Pass botConfig to strategy
    const strategy = new StrategyClass(executor, botConfig);
    if (strategy.setNotifier) {
        strategy.setNotifier(notifier);
    }
    logger.info(`Initialized Strategy from ${strategyPath}`);

    // Pring bot running config
    logger.info(`Bot Config: ${JSON.stringify(botConfig, null, 2)}`);

    // Initialize Bot Engine
    const bot = new Bot(monitor, strategy, botConfig, notifier);

    // Start Bot
    await bot.start();
}

main().catch(e => logger.error('Fatal error:', e));
