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

    private getLogFilePath(): string {
        const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        return path.join(this.logDir, `polybot-${date}.log`);
    }

    private formatMessage(level: string, message: string): string {
        const timestamp = new Date().toISOString();
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
