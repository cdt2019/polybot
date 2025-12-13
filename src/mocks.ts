import { Monitor, Strategy, Notifier } from './core/types';
import { OrderParams } from './executors/PolymarketExecutor';

export class MockMonitor implements Monitor<number> {
    private notifier?: Notifier;

    setNotifier(notifier: Notifier): void {
        this.notifier = notifier;
    }

    async poll(): Promise<number> {
        const val = Math.floor(Math.random() * 100);
        console.log(`[MockMonitor] Polled value: ${val}`);
        if (this.notifier && val > 90) {
            await this.notifier.notify(`[MockMonitor] High value detected: ${val}`);
        }
        return val;
    }
}

export class MockStrategy implements Strategy<number> {
    private executor: any; // In a real app, this would be typed or passed differently
    private notifier?: Notifier;

    constructor(executor: any) {
        this.executor = executor;
    }

    setNotifier(notifier: Notifier): void {
        this.notifier = notifier;
    }

    async evaluate(data: number): Promise<boolean> {
        console.log(`[MockStrategy] Evaluating data: ${data}`);
        if (data > 50) {
            console.log('[MockStrategy] Condition met! Triggering execution.');
            if (this.notifier) {
                await this.notifier.notify(`[MockStrategy] Triggering buy for value: ${data}`);
            }
            await this.executor.execute({
                tokenId: 'mock-token-id',
                price: 0.5,
                size: 10,
                side: 'BUY',
                type: 'LIMIT',
                timeInForce: 'GTC'
            } as OrderParams);
            return true;
        }
        return false;
    }
}
