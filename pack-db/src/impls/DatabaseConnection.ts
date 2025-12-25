import { Kysely, SqliteDialect } from 'kysely';
import SQLite from 'better-sqlite3';
import { Database } from '../interfaces/entities/Account';
import { Config, ConfigKeys } from './Config';

export class DatabaseConnection {
  private db: Kysely<Database>;

  constructor(config: Config) {
    const dbPath = config.get(ConfigKeys.DB_PATH);
    this.db = new Kysely<Database>({ dialect: new SqliteDialect({ database: new SQLite(dbPath) }) });
  }

  getDb(): Kysely<Database> {
    return this.db;
  }

  async runMigrations(): Promise<void> {
    await this.db.schema.createTable('accounts').ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('email', 'text', (col) => col.notNull().unique())
      .addColumn('api_key', 'text', (col) => col.notNull())
      .addColumn('plan_name', 'text', (col) => col.notNull().defaultTo('Free'))
      .addColumn('token_remaining', 'integer', (col) => col.notNull().defaultTo(1000))
      .addColumn('topup_remaining', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('status', 'integer', (col) => col.notNull().defaultTo(1))
      .addColumn('created_at', 'integer', (col) => col.notNull())
      .addColumn('updated_at', 'integer', (col) => col.notNull())
      .execute();
  }

  destroy(): Promise<void> {
    return this.db.destroy();
  }
}
