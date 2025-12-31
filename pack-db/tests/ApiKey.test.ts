import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigKeys } from 'pack-shared';
import { ServiceFactory } from '../src/impls/ServiceFactory';
import { ApiKeyTestCases } from './ApiKeyTestCases';

const TEST_DB_PATH = path.join(__dirname, 'apikey-test.db');
const TEST_ENCRYPTION_KEY = 'test-encryption-key-32chars!!';

function cleanup() {
  [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`].forEach((f) => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
}

describe('ApiKey', () => {
  let factory: ServiceFactory;
  let testAccountId: string;

  beforeAll(async () => {
    ServiceFactory.reset();
    cleanup();
    process.env[ConfigKeys.DB_PATH] = TEST_DB_PATH;
    process.env[ConfigKeys.DB_ENCRYPTION_KEY] = TEST_ENCRYPTION_KEY;
    factory = ServiceFactory.getInstance();
    await factory.getMigrator().runAll();
    const account = await factory.getAccountRepo().createAccount({ email: 'apikey-test@example.com' });
    testAccountId = account.id;
  });

  afterAll(() => {
    ServiceFactory.reset();
    cleanup();
  });

  describe('createApiKey', () => {
    it('should create api key and return plain key', async () => {
      const repo = factory.getAccountRepo();
      const result = await repo.createApiKey({ accountId: testAccountId, label: 'Test Key' });
      expect(result.plainKey, ApiKeyTestCases.EXPECT_PLAIN_KEY_FORMAT).toMatch(/^rslive_v1_[a-f0-9]{48}$/);
      expect(result.apiKey.key_hash, ApiKeyTestCases.EXPECT_KEY_HASH_DEFINED).toBeDefined();
      expect(result.apiKey.key_hash, ApiKeyTestCases.EXPECT_KEY_HASH_NOT_PLAIN).not.toBe(result.plainKey);
      expect(result.apiKey.account_id, ApiKeyTestCases.EXPECT_ACCOUNT_ID_MATCHES).toBe(testAccountId);
      expect(result.apiKey.label, ApiKeyTestCases.EXPECT_LABEL_MATCHES).toBe('Test Key');
      expect(result.apiKey.key_indicator, ApiKeyTestCases.EXPECT_KEY_INDICATOR_FORMAT).toMatch(/^rsliv\.\.\.[a-f0-9]{5}$/);
    });

    it('should truncate label to 30 chars', async () => {
      const repo = factory.getAccountRepo();
      const longLabel = 'This is a very long label that exceeds thirty characters';
      const result = await repo.createApiKey({ accountId: testAccountId, label: longLabel });
      expect(result.apiKey.label.length, ApiKeyTestCases.EXPECT_LABEL_TRUNCATED).toBe(30);
    });

    it('should store hashed key not plain key', async () => {
      const repo = factory.getAccountRepo();
      const result = await repo.createApiKey({ accountId: testAccountId, label: 'Hash Test' });
      expect(result.apiKey.key_hash.length, ApiKeyTestCases.EXPECT_HASH_LENGTH_64).toBe(64);
      expect(result.apiKey.key_hash, ApiKeyTestCases.EXPECT_HASH_NO_RSLIVE).not.toContain('rslive');
    });
  });

  describe('validateApiKey', () => {
    it('should validate correct plain key', async () => {
      const repo = factory.getAccountRepo();
      const result = await repo.createApiKey({ accountId: testAccountId, label: 'Validate Test' });
      const validated = await repo.validateApiKey(result.plainKey);
      expect(validated, ApiKeyTestCases.EXPECT_VALID_KEY_NOT_NULL).not.toBeNull();
      expect(validated!.key_hash, ApiKeyTestCases.EXPECT_VALID_KEY_HASH_MATCHES).toBe(result.apiKey.key_hash);
    });

    it('should return null for invalid key', async () => {
      const repo = factory.getAccountRepo();
      const validated = await repo.validateApiKey('rslive_v1_invalidkey123456789012345678901234567890');
      expect(validated, ApiKeyTestCases.EXPECT_INVALID_KEY_NULL).toBeNull();
    });

    it('should return null for expired key', async () => {
      const repo = factory.getAccountRepo();
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const result = await repo.createApiKey({ accountId: testAccountId, label: 'Expired', expiresAt: pastDate });
      const validated = await repo.validateApiKey(result.plainKey);
      expect(validated, ApiKeyTestCases.EXPECT_EXPIRED_KEY_NULL).toBeNull();
    });

    it('should validate key with future expiry', async () => {
      const repo = factory.getAccountRepo();
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const result = await repo.createApiKey({ accountId: testAccountId, label: 'Future', expiresAt: futureDate });
      const validated = await repo.validateApiKey(result.plainKey);
      expect(validated, ApiKeyTestCases.EXPECT_FUTURE_EXPIRY_VALID).not.toBeNull();
    });
  });

  describe('getApiKeysByAccountId', () => {
    it('should return all keys for account', async () => {
      const repo = factory.getAccountRepo();
      const keys = await repo.getApiKeysByAccountId(testAccountId);
      expect(keys.length, ApiKeyTestCases.EXPECT_KEYS_FOR_ACCOUNT).toBeGreaterThan(0);
      expect(keys.every((k) => k.account_id === testAccountId),
        ApiKeyTestCases.EXPECT_ALL_KEYS_BELONG_TO_ACCOUNT).toBe(true);
    });

    it('should return empty array for non-existent account', async () => {
      const repo = factory.getAccountRepo();
      const keys = await repo.getApiKeysByAccountId('non-existent-id');
      expect(keys, ApiKeyTestCases.EXPECT_EMPTY_FOR_NONEXISTENT).toEqual([]);
    });
  });

  describe('revokeApiKey', () => {
    it('should revoke key by setting expires_at to now', async () => {
      const repo = factory.getAccountRepo();
      const result = await repo.createApiKey({ accountId: testAccountId, label: 'Revoke Test' });
      const revoked = await repo.revokeApiKey(result.apiKey.key_hash);
      expect(revoked, ApiKeyTestCases.EXPECT_REVOKE_SUCCESS).toBe(true);
      const validated = await repo.validateApiKey(result.plainKey);
      expect(validated, ApiKeyTestCases.EXPECT_REVOKED_KEY_INVALID).toBeNull();
    });

    it('should return false for non-existent key', async () => {
      const repo = factory.getAccountRepo();
      const revoked = await repo.revokeApiKey('non-existent-hash');
      expect(revoked, ApiKeyTestCases.EXPECT_REVOKE_NONEXISTENT_FALSE).toBe(false);
    });
  });

  describe('updateLastUsed', () => {
    it('should update last_used_at timestamp', async () => {
      const repo = factory.getAccountRepo();
      const result = await repo.createApiKey({ accountId: testAccountId, label: 'LastUsed Test' });
      expect(result.apiKey.last_used_at, ApiKeyTestCases.EXPECT_LAST_USED_NULL_INITIALLY).toBeNull();
      await repo.updateLastUsed(result.apiKey.key_hash);
      const keys = await repo.getApiKeysByAccountId(testAccountId);
      const updated = keys.find((k) => k.key_hash === result.apiKey.key_hash);
      expect(updated!.last_used_at, ApiKeyTestCases.EXPECT_LAST_USED_UPDATED).not.toBeNull();
    });
  });
});
