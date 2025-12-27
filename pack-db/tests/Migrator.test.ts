import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ServiceFactory } from '../src/impls/ServiceFactory';
import { ConfigKeys } from '../src/impls/Config';
import { PreconditionHelpers } from '../src/impls/migrations/PreconditionHelpers';
import { MigratorTestCases } from './MigratorTestCases';

const TEST_DB_PATH = path.join(__dirname, 'migrator-test.db');
const TEST_ENCRYPTION_KEY = 'test-encryption-key-32chars!!';

function cleanup() {
  [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`].forEach((f) => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
}

describe('Migrator', () => {
  let factory: ServiceFactory;

  beforeAll(() => {
    ServiceFactory.reset();
    cleanup();
    process.env[ConfigKeys.DB_PATH] = TEST_DB_PATH;
    process.env[ConfigKeys.DB_ENCRYPTION_KEY] = TEST_ENCRYPTION_KEY;
    factory = ServiceFactory.getInstance();
  });

  afterAll(() => {
    ServiceFactory.reset();
    cleanup();
  });

  describe('runAll', () => {
    it('should run all migrations and create tables', async () => {
      const migrator = factory.getMigrator();
      const results = await migrator.runAll();
      expect(results.length, MigratorTestCases.EXPECT_MIGRATIONS_RUN).toBeGreaterThan(0);
      expect(results.every((r) => r.status === 'executed' || r.status === 'skipped'),
        MigratorTestCases.EXPECT_ALL_EXECUTED_OR_SKIPPED).toBe(true);
      const db = factory.getDatabaseConnection().getDb();
      expect(await PreconditionHelpers.tableExists(db, 'accounts'),
        MigratorTestCases.EXPECT_ACCOUNTS_TABLE_EXISTS).toBe(true);
    });

    it('should skip migrations on second run (idempotent)', async () => {
      const migrator = factory.getMigrator();
      const results = await migrator.runAll();
      expect(results.every((r) => r.status === 'skipped'),
        MigratorTestCases.EXPECT_ALL_SKIPPED_ON_RERUN).toBe(true);
    });
  });

  describe('PreconditionHelpers', () => {
    it('tableExists returns true for existing table', async () => {
      const db = factory.getDatabaseConnection().getDb();
      expect(await PreconditionHelpers.tableExists(db, 'accounts'),
        MigratorTestCases.EXPECT_TABLE_EXISTS_TRUE).toBe(true);
    });

    it('tableExists returns false for non-existing table', async () => {
      const db = factory.getDatabaseConnection().getDb();
      expect(await PreconditionHelpers.tableExists(db, 'non_existent_table'),
        MigratorTestCases.EXPECT_TABLE_EXISTS_FALSE).toBe(false);
    });

    it('columnExists returns true for existing column', async () => {
      const db = factory.getDatabaseConnection().getDb();
      expect(await PreconditionHelpers.columnExists(db, 'accounts', 'email'),
        MigratorTestCases.EXPECT_COLUMN_EXISTS_TRUE).toBe(true);
    });

    it('columnExists returns false for non-existing column', async () => {
      const db = factory.getDatabaseConnection().getDb();
      expect(await PreconditionHelpers.columnExists(db, 'accounts', 'non_existent_column'),
        MigratorTestCases.EXPECT_COLUMN_EXISTS_FALSE).toBe(false);
    });

    it('indexExists returns true for existing index', async () => {
      const db = factory.getDatabaseConnection().getDb();
      expect(await PreconditionHelpers.indexExists(db, 'accounts_email_index'),
        MigratorTestCases.EXPECT_INDEX_EXISTS_TRUE).toBe(true);
    });

    it('indexExists returns false for non-existing index', async () => {
      const db = factory.getDatabaseConnection().getDb();
      expect(await PreconditionHelpers.indexExists(db, 'non_existent_index'),
        MigratorTestCases.EXPECT_INDEX_EXISTS_FALSE).toBe(false);
    });
  });
});
