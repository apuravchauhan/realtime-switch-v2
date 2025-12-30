import dotenv from 'dotenv';
import path from 'path';

export enum ConfigKeys {
  DB_PATH = 'DB_PATH',
  DB_ENCRYPTION_KEY = 'DB_ENCRYPTION_KEY',
  GEMINI_API_KEY = 'GEMINI_API_KEY',
  ZMQ_SOCKET_PATH = 'ZMQ_SOCKET_PATH',
}

export class Config {
  private config: Map<ConfigKeys, string>;

  constructor() {
    const isTest = process.env.NODE_ENV === 'test';
    const envFile = isTest ? '.env.test' : '.env';
    const envPath = path.resolve(__dirname, '../../../../', envFile);
    dotenv.config({ path: envPath });
    this.config = new Map();
    for (const key of Object.values(ConfigKeys)) {
      const value = process.env[key];
      if (value) this.config.set(key as ConfigKeys, value);
    }
  }

  get(key: ConfigKeys): string {
    const value = this.config.get(key);
    if (!value) throw new Error(`Configuration key '${key}' not found`);
    return value;
  }

  has(key: ConfigKeys): boolean {
    return this.config.has(key);
  }
}
