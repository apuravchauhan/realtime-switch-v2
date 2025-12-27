import { Kysely, sql } from 'kysely';

export class PreconditionHelpers {
  static async tableExists(db: Kysely<any>, tableName: string): Promise<boolean> {
    const result = await sql<{ cnt: number }>`
      SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'table' AND name = ${tableName}
    `.execute(db);
    return result.rows[0].cnt > 0;
  }

  static async columnExists(db: Kysely<any>, tableName: string, columnName: string): Promise<boolean> {
    const result = await sql<{ name: string }>`PRAGMA table_info(${sql.raw(tableName)})`.execute(db);
    return result.rows.some((row) => row.name === columnName);
  }

  static async indexExists(db: Kysely<any>, indexName: string): Promise<boolean> {
    const result = await sql<{ cnt: number }>`
      SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'index' AND name = ${indexName}
    `.execute(db);
    return result.rows[0].cnt > 0;
  }

  static async triggerExists(db: Kysely<any>, triggerName: string): Promise<boolean> {
    const result = await sql<{ cnt: number }>`
      SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'trigger' AND name = ${triggerName}
    `.execute(db);
    return result.rows[0].cnt > 0;
  }

  static async tableIsEmpty(db: Kysely<any>, tableName: string): Promise<boolean> {
    const result = await sql<{ cnt: number }>`SELECT COUNT(*) as cnt FROM ${sql.raw(tableName)}`.execute(db);
    return result.rows[0].cnt === 0;
  }

  static async rowExists(db: Kysely<any>, tableName: string, column: string, value: string): Promise<boolean> {
    const result = await sql<{ cnt: number }>`
      SELECT COUNT(*) as cnt FROM ${sql.raw(tableName)} WHERE ${sql.raw(column)} = ${value}
    `.execute(db);
    return result.rows[0].cnt > 0;
  }
}
