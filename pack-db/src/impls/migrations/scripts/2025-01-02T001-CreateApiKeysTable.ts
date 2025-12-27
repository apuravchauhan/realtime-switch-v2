import { Kysely, sql } from 'kysely';
import { PreconditionHelpers } from '../PreconditionHelpers';
import { MigrationStatus } from '../Migrator';

export async function up(db: Kysely<any>): Promise<MigrationStatus> {
  if (await PreconditionHelpers.tableExists(db, 'api_keys')) {
    console.log('✅ SKIPPED: api_keys table already exists');
    return 'skipped';
  }

  if (!(await PreconditionHelpers.tableExists(db, 'accounts'))) {
    throw new Error('❌ HALT: accounts table must exist before creating api_keys table');
  }

  await db.schema.createTable('api_keys')
    .addColumn('key_hash', 'text', (col) => col.primaryKey())
    .addColumn('account_id', 'text', (col) => col.notNull().references('accounts.id').onDelete('cascade'))
    .addColumn('key_indicator', 'text', (col) => col.notNull())
    .addColumn('label', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('expires_at', 'text')
    .addColumn('last_used_at', 'text')
    .execute();

  await db.schema.createIndex('api_keys_account_id_index').on('api_keys').column('account_id').execute();

  console.log('✅ EXECUTED: api_keys table created with indexes');
  return 'executed';
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('api_keys').ifExists().execute();
}
