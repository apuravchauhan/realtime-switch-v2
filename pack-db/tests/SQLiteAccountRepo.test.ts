import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ServiceFactory } from '../src/impls/ServiceFactory';
import { ConfigKeys } from '../src/impls/Config';
import { AccountTestCases } from './AccountTestCases';

const TEST_DB_PATH = path.join(__dirname, 'test.db');
const TEST_ENCRYPTION_KEY = 'test-encryption-key-32chars!!';

describe('SQLiteAccountRepo', () => {
  let factory: ServiceFactory;

  beforeAll(async () => {
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

  function cleanup() {
    [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`].forEach((f) => {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
  }

  describe('createAccount', () => {
    it('should create account with defaults', async () => {
      const repo = factory.getAccountRepo();
      const account = await repo.createAccount({ email: 'test@example.com' });
      expect(account.id, AccountTestCases.EXPECT_ACCOUNT_ID_DEFINED).toBeDefined();
      expect(account.email, AccountTestCases.EXPECT_EMAIL_MATCHES).toBe('test@example.com');
      expect(account.plan_name, AccountTestCases.EXPECT_DEFAULT_PLAN_FREE).toBe('Free');
      expect(account.token_remaining, AccountTestCases.EXPECT_DEFAULT_TOKENS_1000).toBe(1000);
      expect(account.topup_remaining, AccountTestCases.EXPECT_DEFAULT_TOPUP_0).toBe(0);
      expect(account.status, AccountTestCases.EXPECT_STATUS_ACTIVE).toBe(1);
    });

    it('should create account with Pro plan defaults', async () => {
      const repo = factory.getAccountRepo();
      const account = await repo.createAccount({ email: 'pro@example.com', planName: 'Pro' });
      expect(account.plan_name, AccountTestCases.EXPECT_PRO_PLAN).toBe('Pro');
      expect(account.token_remaining, AccountTestCases.EXPECT_PRO_TOKENS_50000).toBe(50000);
    });

    it('should create account with custom values', async () => {
      const repo = factory.getAccountRepo();
      const account = await repo.createAccount({ email: 'custom@example.com', tokenRemaining: 5000, topupRemaining: 2000 });
      expect(account.token_remaining, AccountTestCases.EXPECT_CUSTOM_TOKENS).toBe(5000);
      expect(account.topup_remaining, AccountTestCases.EXPECT_CUSTOM_TOPUP).toBe(2000);
    });
  });

  describe('getAccount', () => {
    it('should return account by id', async () => {
      const repo = factory.getAccountRepo();
      const created = await repo.createAccount({ email: 'get@example.com' });
      const account = await repo.getAccount(created.id);
      expect(account, AccountTestCases.EXPECT_ACCOUNT_NOT_NULL).not.toBeNull();
      expect(account!.id, AccountTestCases.EXPECT_ACCOUNT_ID_DEFINED).toBe(created.id);
      expect(account!.email, AccountTestCases.EXPECT_EMAIL_MATCHES).toBe('get@example.com');
    });

    it('should return null for non-existent id', async () => {
      const repo = factory.getAccountRepo();
      const account = await repo.getAccount('non-existent-id');
      expect(account, AccountTestCases.EXPECT_ACCOUNT_NULL_FOR_NONEXISTENT).toBeNull();
    });
  });
});
