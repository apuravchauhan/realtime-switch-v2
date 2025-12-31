import { Kysely, sql } from 'kysely';
import { PreconditionHelpers } from '../PreconditionHelpers';
import { MigrationStatus } from '../Migrator';

export async function up(db: Kysely<any>): Promise<MigrationStatus> {
  if (await PreconditionHelpers.tableExists(db, 'sessions')) {
    console.log('✅ SKIPPED: sessions table already exists');
    return 'skipped';
  }

  
  
  
  await sql`
    CREATE TABLE sessions (
      account_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('SESSION', 'CONV')),
      data TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      PRIMARY KEY (account_id, session_id, type)
    )
  `.execute(db);

  
  await db.schema.createIndex('sessions_created_index')
    .on('sessions')
    .column('created_at')
    .execute();

  console.log('✅ EXECUTED: sessions table created with composite PK and indexes');
  return 'executed';
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('sessions').ifExists().execute();
}
