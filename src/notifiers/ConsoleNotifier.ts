import { Notifier } from '../core/types';

export class ConsoleNotifier implements Notifier {
    async notify(message: string): Promise<void> {
        const timestamp = new Date().toISOString();
        console.log(`[NOTIFICATION ${timestamp}] ${message}`);
    }
}
