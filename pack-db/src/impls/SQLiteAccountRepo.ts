import { Kysely, sql } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import { createHash, randomBytes } from 'crypto';
import { IAccountRepo } from '../interfaces/IAccountRepo';
import { Account, CreateAccountInput, Database } from '../interfaces/entities/Account';
import { ApiKey, CreateApiKeyInput, CreateApiKeyResult } from '../interfaces/entities/ApiKey';

const PLAN_DEFAULTS: Record<string, number> = { Free: 1000, Pro: 50000, Enterprise: 500000 };

export class SQLiteAccountRepo implements IAccountRepo {
  constructor(private db: Kysely<Database>) {}

  async createAccount(input: CreateAccountInput): Promise<Account> {
    const now = new Date().toISOString();
    const planName = input.planName ?? 'Free';
    const row: Account = {
      id: uuidv4(),
      email: input.email,
      plan_name: planName,
      token_remaining: input.tokenRemaining ?? PLAN_DEFAULTS[planName] ?? 1000,
      topup_remaining: input.topupRemaining ?? 0,
      status: 1,
      created_at: now,
      updated_at: now,
    };
    await this.db.insertInto('accounts').values(row).execute();
    return row;
  }

  async getAccount(accountId: string): Promise<Account | null> {
    const result = await this.db.selectFrom('accounts').selectAll().where('id', '=', accountId).executeTakeFirst();
    return result ?? null;
  }

  async createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
    const plainKey = this.generateKey();
    const keyHash = this.hashKey(plainKey);
    const keyIndicator = this.createKeyIndicator(plainKey);
    const now = new Date().toISOString();
    const label = input.label.slice(0, 30);
    const row: ApiKey = {
      key_hash: keyHash,
      account_id: input.accountId,
      key_indicator: keyIndicator,
      label,
      created_at: now,
      expires_at: input.expiresAt ?? null,
      last_used_at: null,
    };
    await this.db.insertInto('api_keys').values(row).execute();
    return { apiKey: row, plainKey };
  }

  async validateApiKey(plainKey: string): Promise<ApiKey | null> {
    const keyHash = this.hashKey(plainKey);
    const now = new Date().toISOString();
    const result = await this.db.selectFrom('api_keys').selectAll().where('key_hash', '=', keyHash)
      .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', now)]))
      .executeTakeFirst();
    return result ?? null;
  }

  async getApiKeysByAccountId(accountId: string): Promise<ApiKey[]> {
    return await this.db.selectFrom('api_keys').selectAll().where('account_id', '=', accountId)
      .orderBy('created_at', 'desc').execute();
  }

  async revokeApiKey(keyHash: string): Promise<boolean> {
    const result = await this.db.updateTable('api_keys').set({ expires_at: new Date().toISOString() })
      .where('key_hash', '=', keyHash).executeTakeFirst();
    return result.numUpdatedRows > 0;
  }

  async updateLastUsed(keyHash: string): Promise<void> {
    await this.db.updateTable('api_keys').set({ last_used_at: new Date().toISOString() })
      .where('key_hash', '=', keyHash).execute();
  }

  private generateKey(): string {
    const random = randomBytes(24).toString('hex');
    return `rslive_v1_${random}`;
  }

  private hashKey(plainKey: string): string {
    return createHash('sha256').update(plainKey).digest('hex');
  }

  private createKeyIndicator(plainKey: string): string {
    return `${plainKey.slice(0, 5)}...${plainKey.slice(-5)}`;
  }
}
