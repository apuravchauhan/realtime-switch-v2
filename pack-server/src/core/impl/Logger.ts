export type LogLevel = 'debug' | 'warn' | 'error';

export class Logger {
  private static readonly DEBUG = 'debug' as const;
  private static readonly WARN = 'warn' as const;
  private static readonly ERROR = 'error' as const;

  private static level: LogLevel = Logger.DEBUG;
  private static accId: string | null = null;

  private static readonly LEVELS: Record<LogLevel, number> = {
    debug: 0,
    warn: 1,
    error: 2,
  };

  static setLevel(level: LogLevel): void {
    Logger.level = level;
  }

  static setAccountFilter(accId: string | null): void {
    Logger.accId = accId;
  }

  private static shouldLog(level: LogLevel, accId: string | null): boolean {
    if (Logger.accId !== null && Logger.accId === accId) {
      return true;
    }
    return Logger.LEVELS[level] >= Logger.LEVELS[Logger.level];
  }

  static debug(className: string, accId: string | null, message: string, ...args: any[]): void {
    if (Logger.shouldLog(Logger.DEBUG, accId)) {
      console.log(`[${className}] ${Logger.formatMessage(message, args)}`);
    }
  }

  static warn(className: string, accId: string | null, message: string, ...args: any[]): void {
    if (Logger.shouldLog(Logger.WARN, accId)) {
      console.warn(`[${className}] ${Logger.formatMessage(message, args)}`);
    }
  }

  static error(className: string, accId: string | null, message: string, error: Error, ...args: any[]): void {
    if (Logger.shouldLog(Logger.ERROR, accId)) {
      console.error(`[${className}] ${Logger.formatMessage(message, args)}`);
      if (error && error.stack) {
        console.error(error.stack);
      }
    }
  }

  private static formatMessage(message: string, args: any[]): string {
    return args.length ? `${message} - {${args.join(', ')}}` : message;
  }

  static getLevel(): LogLevel {
    return Logger.level;
  }

  static getAccountFilter(): string | null {
    return Logger.accId;
  }
}
