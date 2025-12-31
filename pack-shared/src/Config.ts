import dotenv from 'dotenv';
import path from 'path';

export enum ConfigKeys {
  OPENAI_API_KEY = 'OPENAI_API_KEY',
  GEMINI_API_KEY = 'GEMINI_API_KEY',
  ZMQ_SOCKET_PATH = 'ZMQ_SOCKET_PATH',
  ZMQ_TIMEOUT_MS = 'ZMQ_TIMEOUT_MS',
  DB_PATH = 'DB_PATH',
  DB_ENCRYPTION_KEY = 'DB_ENCRYPTION_KEY',
}

export class Config {
  private static config: Map<ConfigKeys, string> | null = null;
  private static initialized = false;

  private constructor() {
    // Private constructor to prevent instantiation
  }

  private static initialize(): void {
    if (Config.initialized) {
      return;
    }

    const isTest = process.env.NODE_ENV === 'test';
    const envFile = isTest ? '.env.test' : '.env';
    const envPath = path.resolve(__dirname, '../../../', envFile);
    dotenv.config({ path: envPath });

    Config.config = new Map();

    for (const key of Object.values(ConfigKeys)) {
      const value = process.env[key];
      if (value) {
        Config.config.set(key as ConfigKeys, value);
      }
    }

    Config.initialized = true;
  }

  public static reset(): void {
    Config.config = null;
    Config.initialized = false;
  }

  public static get(key: ConfigKeys): string {
    Config.initialize();
    const value = Config.config!.get(key);
    if (!value) {
      throw new Error(`Configuration key '${key}' not found`);
    }
    return value;
  }

  public static has(key: ConfigKeys): boolean {
    Config.initialize();
    return Config.config!.has(key);
  }

  public static getLoadedKeys(): ConfigKeys[] {
    Config.initialize();
    return Array.from(Config.config!.keys());
  }
}
