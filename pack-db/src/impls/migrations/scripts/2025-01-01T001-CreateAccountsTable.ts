import { Kysely, sql } from 'kysely';
import { PreconditionHelpers } from '../PreconditionHelpers';
import { MigrationStatus } from '../Migrator';

export async function up(db: Kysely<any>): Promise<MigrationStatus> {
  if (await PreconditionHelpers.tableExists(db, 'accounts')) {
    console.log('✅ SKIPPED: accounts table already exists');
    return 'skipped';
  }

  await db.schema.createTable('accounts')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('email', 'text', (col) => col.notNull().unique())
    .addColumn('plan_name', 'text', (col) => col.notNull().defaultTo('Free'))
    .addColumn('token_remaining', 'integer', (col) => col.notNull().defaultTo(1000))
    .addColumn('topup_remaining', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('status', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  await db.schema.createIndex('accounts_email_index').on('accounts').column('email').execute();
  await db.schema.createIndex('accounts_status_index').on('accounts').column('status').execute();

  console.log('✅ EXECUTED: accounts table created with indexes');
  return 'executed';
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('accounts').ifExists().execute();
}
