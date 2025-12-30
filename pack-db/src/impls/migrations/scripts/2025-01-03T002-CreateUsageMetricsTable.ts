import { Kysely, sql } from 'kysely';
import { PreconditionHelpers } from '../PreconditionHelpers';
import { MigrationStatus } from '../Migrator';

export async function up(db: Kysely<any>): Promise<MigrationStatus> {
  if (await PreconditionHelpers.tableExists(db, 'usage_metrics')) {
    console.log('✅ SKIPPED: usage_metrics table already exists');
    return 'skipped';
  }

  // Usage metrics table - tracks token usage per session
  // Matches prod schema from realtime-switch-db
  await sql`
    CREATE TABLE usage_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      audio_duration_ms INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `.execute(db);

  // Indexes for querying usage data
  await db.schema.createIndex('idx_usage_account')
    .on('usage_metrics')
    .column('account_id')
    .execute();

  await db.schema.createIndex('idx_usage_provider')
    .on('usage_metrics')
    .column('provider')
    .execute();

  await db.schema.createIndex('idx_usage_created')
    .on('usage_metrics')
    .column('created_at')
    .execute();

  await db.schema.createIndex('idx_usage_account_time')
    .on('usage_metrics')
    .columns(['account_id', 'created_at'])
    .execute();

  console.log('✅ EXECUTED: usage_metrics table created with indexes');
  return 'executed';
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('usage_metrics').ifExists().execute();
}
