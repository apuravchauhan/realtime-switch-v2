import dotenv from 'dotenv';
import path from 'path';

export enum ConfigKeys {
  DB_PATH = 'DB_PATH',
}

export class Config {
  private config: Map<ConfigKeys, string>;

  constructor() {
    const envPath = path.resolve(__dirname, '../../../../.env');
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
