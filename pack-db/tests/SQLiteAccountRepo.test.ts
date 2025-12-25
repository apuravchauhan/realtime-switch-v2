import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ServiceFactory } from '../src/impls/ServiceFactory';
import { ConfigKeys } from '../src/impls/Config';

const TEST_DB_PATH = path.join(__dirname, 'test.db');

describe('SQLiteAccountRepo', () => {
  let factory: ServiceFactory;

  beforeAll(async () => {
    cleanup();
    process.env[ConfigKeys.DB_PATH] = TEST_DB_PATH;
    factory = ServiceFactory.getInstance();
    await factory.getDatabaseConnection().runMigrations();
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
      expect(account.id).toBeDefined();
      expect(account.email).toBe('test@example.com');
      expect(account.api_key).toMatch(/^rs_[a-f0-9]{32}$/);
      expect(account.plan_name).toBe('Free');
      expect(account.token_remaining).toBe(1000);
      expect(account.topup_remaining).toBe(0);
      expect(account.status).toBe(1);
    });

    it('should create account with Pro plan defaults', async () => {
      const repo = factory.getAccountRepo();
      const account = await repo.createAccount({ email: 'pro@example.com', planName: 'Pro' });
      expect(account.plan_name).toBe('Pro');
      expect(account.token_remaining).toBe(50000);
    });

    it('should create account with custom values', async () => {
      const repo = factory.getAccountRepo();
      const account = await repo.createAccount({ email: 'custom@example.com', tokenRemaining: 5000, topupRemaining: 2000 });
      expect(account.token_remaining).toBe(5000);
      expect(account.topup_remaining).toBe(2000);
    });
  });

  describe('getAccount', () => {
    it('should return account by id', async () => {
      const repo = factory.getAccountRepo();
      const created = await repo.createAccount({ email: 'get@example.com' });
      const account = await repo.getAccount(created.id);
      expect(account).not.toBeNull();
      expect(account!.id).toBe(created.id);
      expect(account!.email).toBe('get@example.com');
    });

    it('should return null for non-existent id', async () => {
      const repo = factory.getAccountRepo();
      const account = await repo.getAccount('non-existent-id');
      expect(account).toBeNull();
    });
  });
});
