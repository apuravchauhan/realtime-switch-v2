import { Kysely, SqliteDialect } from 'kysely';
import SQLite from 'better-sqlite3-multiple-ciphers';
import { Database } from '../interfaces/entities/Account';
import { Config, ConfigKeys } from './Config';

export class DatabaseConnection {
  private db: Kysely<Database>;

  constructor(config: Config) {
    const dbPath = config.get(ConfigKeys.DB_PATH);
    const encryptionKey = config.get(ConfigKeys.DB_ENCRYPTION_KEY);
    const sqlite = new SQLite(dbPath);
    sqlite.pragma(`cipher='sqlcipher'`);
    sqlite.pragma(`legacy=4`);
    sqlite.pragma(`key='${encryptionKey}'`);
    this.db = new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
  }

  getDb(): Kysely<Database> {
    return this.db;
  }

  destroy(): Promise<void> {
    return this.db.destroy();
  }
}
