
export interface Monitor<T> {
    /**
     * Checks the source and returns the data.
     */
    poll(): Promise<T>;

    /**
     * Optional: Sets the notifier for sending alerts.
     */
    setNotifier?(notifier: Notifier): void;
}

export interface Executor<T> {
    /**
     * Executes an action based on the data.
     */
    execute(data: T): Promise<boolean>;
}

export interface Strategy<T> {
    /**
     * Analyzes the data and decides whether to trigger the executor.
     * Returns true if execution was triggered, false otherwise.
     */
    evaluate(data: T): Promise<boolean>;

    /**
     * Optional: Sets the notifier for sending alerts.
     */
    setNotifier?(notifier: Notifier): void;
}

export interface BotConfig {
    intervalMs: number;
    orderSize?: number;
    orderType?: 'LIMIT' | 'MARKET';
    orderPrice?: number;
    [key: string]: any; // Allow other dynamic props if needed
}

export interface Notifier {
    /**
     * Sends a notification message.
     */
    notify(message: string): Promise<void>;
}
