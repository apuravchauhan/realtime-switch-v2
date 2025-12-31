import { Kysely, SqliteDialect } from 'kysely';
import SQLite from 'better-sqlite3-multiple-ciphers';
import { Database } from '../interfaces/entities/Account';
import { Config, ConfigKeys } from 'pack-shared';

export class DatabaseConnection {
  private db: Kysely<Database>;

  constructor() {
    const dbPath = Config.get(ConfigKeys.DB_PATH);
    const encryptionKey = Config.get(ConfigKeys.DB_ENCRYPTION_KEY);
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
