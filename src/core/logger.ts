import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

export class Logger {
    private logDir: string;
    private level: LogLevel;

    constructor(level: LogLevel = LogLevel.INFO) {
        this.logDir = path.join(process.cwd(), 'logs');
        this.level = level;

        // Ensure log directory exists
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    /**
     * Get the ISO string representation of local time (including milliseconds).
     * Format: YYYY-MM-DDTHH:mm:ss.sss
     */
    private getLocalTimestamp(): string {
        const now = new Date();
        // 1. Get local timezone offset in milliseconds (e.g., UTC+8 returns -480 minutes converted to ms)
        const offsetMs = now.getTimezoneOffset() * 60000;

        // 2. Adjust the timestamp so that the underlying UTC value matches the local wall time
        const localDate = new Date(now.getTime() - offsetMs);

        // 3. Convert to ISO string: "2025-12-16T14:08:31.731Z"
        // 4. Remove the trailing 'Z' to indicate this is local time, not UTC
        return localDate.toISOString().slice(0, -1);
    }

    /**
     * Get the date string for the log filename.
     * Format: YYYY-MM-DD
     */
    private getLocalDate(): string {
        // Reuse the logic above to ensure strict consistency between the filename and the log timestamp
        return this.getLocalTimestamp().split('T')[0];
    }

    private getLogFilePath(): string {
        const date = this.getLocalDate(); // YYYY-MM-DD
        return path.join(this.logDir, `polybot-${date}.log`);
    }

    private formatMessage(level: string, message: string): string {
        const timestamp = this.getLocalTimestamp();
        return `[${timestamp}] [${level}] ${message}`;
    }

    private write(level: string, message: string) {
        const formatted = this.formatMessage(level, message);

        // Console
        console.log(formatted);

        // File
        try {
            const logFile = this.getLogFilePath();
            fs.appendFileSync(logFile, formatted + '\n');
        } catch (e) {
            console.error('Failed to write to log file:', e);
        }
    }

    debug(message: string) {
        if (this.level <= LogLevel.DEBUG) this.write('DEBUG', message);
    }

    info(message: string) {
        if (this.level <= LogLevel.INFO) this.write('INFO', message);
    }

    warn(message: string) {
        if (this.level <= LogLevel.WARN) this.write('WARN', message);
    }

    error(message: string, error?: any) {
        if (this.level <= LogLevel.ERROR) {
            const msg = error ? `${message} ${error instanceof Error ? error.stack : JSON.stringify(error)}` : message;
            this.write('ERROR', msg);
        }
    }
}

export const logger = new Logger();
