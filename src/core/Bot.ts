import { Monitor, Strategy, BotConfig, Notifier } from './types';

export class Bot<T> {
    private monitor: Monitor<T>;
    private strategy: Strategy<T>;
    private config: BotConfig;
    private notifier?: Notifier;
    private isRunning: boolean = false;
    //private lastData: T | undefined;

    constructor(monitor: Monitor<T>, strategy: Strategy<T>, config: BotConfig, notifier?: Notifier) {
        this.monitor = monitor;
        this.strategy = strategy;
        this.config = config;
        this.notifier = notifier;
    }

    public async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('Bot started.');
        if (this.notifier) await this.notifier.notify('Bot started.');
        this.loop();
    }

    public stop() {
        this.isRunning = false;
        console.log('Bot stopped.');
    }

    private async loop() {
        while (this.isRunning) {
            try {
                const data = await this.monitor.poll();

                // Check for data change
                // if (this.notifier && JSON.stringify(data) !== JSON.stringify(this.lastData)) {
                //     await this.notifier.notify(`Monitor data changed: ${JSON.stringify(data)}`);
                // }
                // this.lastData = data;

                const shouldStop = await this.strategy.evaluate(data);
                if (shouldStop) {
                    console.log('Strategy requested stop. Exiting bot loop.');
                    if (this.notifier) await this.notifier.notify('Strategy requested stop. Exiting bot loop.');
                    this.stop();
                    break;
                }
            } catch (error) {
                console.error('Error in bot loop:', error);
                if (this.notifier) await this.notifier.notify(`Error in bot loop: ${error}`);
            }
            await new Promise(resolve => setTimeout(resolve, this.config.intervalMs));
        }
    }
}
