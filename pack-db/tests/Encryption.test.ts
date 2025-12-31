import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import SQLite from 'better-sqlite3-multiple-ciphers';
import { ConfigKeys } from 'pack-shared';
import { ServiceFactory } from '../src/impls/ServiceFactory';
import { EncryptionTestCases } from './EncryptionTestCases';

const TEST_DB_PATH = path.join(__dirname, 'encryption-test.db');
const TEST_ENCRYPTION_KEY = 'test-encryption-key-32chars!!';
const WRONG_KEY = 'wrong-key-will-not-work!!!!!';

function cleanup() {
  [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`].forEach((f) => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
}

describe('Database Encryption', () => {
  let factory: ServiceFactory;

  beforeAll(async () => {
    ServiceFactory.reset();
    cleanup();
    process.env[ConfigKeys.DB_PATH] = TEST_DB_PATH;
    process.env[ConfigKeys.DB_ENCRYPTION_KEY] = TEST_ENCRYPTION_KEY;
    factory = ServiceFactory.getInstance();
    await factory.getMigrator().runAll();
  });

  afterAll(() => {
    ServiceFactory.reset();
    cleanup();
  });

  it('should connect and write data successfully', async () => {
    const repo = factory.getAccountRepo();
    const account = await repo.createAccount({ email: 'encrypt-test@example.com' });
    expect(account.id, EncryptionTestCases.EXPECT_CONNECT_AND_WRITE_SUCCESS).toBeDefined();
    expect(account.email, EncryptionTestCases.EXPECT_CONNECT_AND_WRITE_SUCCESS).toBe('encrypt-test@example.com');
  });

  it('should read data back in plain text', async () => {
    const repo = factory.getAccountRepo();
    const account = await repo.createAccount({ email: 'read-test@example.com' });
    const retrieved = await repo.getAccount(account.id);
    expect(retrieved, EncryptionTestCases.EXPECT_READ_PLAIN_TEXT).not.toBeNull();
    expect(retrieved!.email, EncryptionTestCases.EXPECT_READ_PLAIN_TEXT).toBe('read-test@example.com');
    expect(retrieved!.plan_name, EncryptionTestCases.EXPECT_READ_PLAIN_TEXT).toBe('Free');
  });

  it('should store data encrypted on disk (raw file unreadable)', () => {
    const rawContent = fs.readFileSync(TEST_DB_PATH);
    const contentStr = rawContent.toString('utf-8');
    expect(contentStr, EncryptionTestCases.EXPECT_FILE_ENCRYPTED).not.toContain('encrypt-test@example.com');
    expect(contentStr, EncryptionTestCases.EXPECT_FILE_ENCRYPTED).not.toContain('read-test@example.com');
    expect(contentStr, EncryptionTestCases.EXPECT_FILE_ENCRYPTED).not.toContain('accounts');
  });

  it('should fail to open with wrong key', () => {
    const sqlite = new SQLite(TEST_DB_PATH);
    sqlite.pragma(`cipher='sqlcipher'`);
    sqlite.pragma(`legacy=4`);
    sqlite.pragma(`key='${WRONG_KEY}'`);
    expect(() => sqlite.exec('SELECT * FROM accounts'), EncryptionTestCases.EXPECT_FAIL_WRONG_KEY).toThrow();
    sqlite.close();
  });

  it('should fail to open without any key (plain SQLite)', () => {
    const sqlite = new SQLite(TEST_DB_PATH);
    expect(() => sqlite.exec('SELECT * FROM accounts'), EncryptionTestCases.EXPECT_FAIL_NO_KEY).toThrow();
    sqlite.close();
  });

  it('should succeed with correct key', () => {
    const sqlite = new SQLite(TEST_DB_PATH);
    sqlite.pragma(`cipher='sqlcipher'`);
    sqlite.pragma(`legacy=4`);
    sqlite.pragma(`key='${TEST_ENCRYPTION_KEY}'`);
    const rows = sqlite.prepare('SELECT email FROM accounts').all() as { email: string }[];
    expect(rows.length, EncryptionTestCases.EXPECT_SUCCESS_CORRECT_KEY).toBeGreaterThan(0);
    expect(rows.some((r) => r.email === 'encrypt-test@example.com'),
      EncryptionTestCases.EXPECT_SUCCESS_CORRECT_KEY).toBe(true);
    sqlite.close();
  });
});
