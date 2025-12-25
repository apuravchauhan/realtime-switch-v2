import dotenv from 'dotenv';
import path from 'path';

export enum ConfigKeys {
  OPENAI_API_KEY = 'OPENAI_API_KEY',
  GEMINI_API_KEY = 'GEMINI_API_KEY',
}

export class Config {
  private static instance: Config;
  private config: Map<ConfigKeys, string>;

  private constructor() {
    const envPath = path.resolve(__dirname, '../../../../.env');
    dotenv.config({ path: envPath });

    this.config = new Map();

    for (const key of Object.values(ConfigKeys)) {
      const value = process.env[key];
      if (value) {
        this.config.set(key as ConfigKeys, value);
      }
    }
  }

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  public get(key: ConfigKeys): string {
    const value = this.config.get(key);
    if (!value) {
      throw new Error(`Configuration key '${key}' not found`);
    }
    return value;
  }

  public has(key: ConfigKeys): boolean {
    return this.config.has(key);
  }

  public getLoadedKeys(): ConfigKeys[] {
    return Array.from(this.config.keys());
  }
}
