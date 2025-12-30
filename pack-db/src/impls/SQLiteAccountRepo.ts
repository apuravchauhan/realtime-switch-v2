import { Kysely, sql } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import { createHash, randomBytes } from 'crypto';
import { IAccountRepo } from '../interfaces/IAccountRepo';
import { Account, CreateAccountInput, Database } from '../interfaces/entities/Account';
import { ApiKey, CreateApiKeyInput, CreateApiKeyResult } from '../interfaces/entities/ApiKey';

const PLAN_DEFAULTS: Record<string, number> = { Free: 1000, Pro: 50000, Enterprise: 500000 };

// Row returned from loadSessionByKeyAndId JOIN query
export interface SessionRow {
  account_id: string;
  type: string;  // 'SESSION' or 'CONV'
  data: string;  // JSON blob
  token_remaining: number;
  topup_remaining: number;
}

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

  async getCredits(accountId: string): Promise<{ tokenRemaining: number; topupRemaining: number } | null> {
    const result = await this.db
      .selectFrom('accounts')
      .select(['token_remaining', 'topup_remaining'])
      .where('id', '=', accountId)
      .executeTakeFirst();

    if (!result) return null;
    return {
      tokenRemaining: result.token_remaining,
      topupRemaining: result.topup_remaining,
    };
  }

  // Raw DB query: returns 0-2 rows based on key validity and session existence
  // 0 rows = invalid key or expired
  // 1 row = valid key, session exists (SESSION type only)
  // 2 rows = valid key, session + conversation exist (SESSION + CONV types)
  async loadSessionByKeyAndId(apiKey: string, sessionId: string): Promise<SessionRow[]> {
    const keyHash = this.hashKey(apiKey);
    const now = new Date().toISOString();

    // Join api_keys with sessions to validate key and get session data in one query
    const rows = await sql<SessionRow>`
      SELECT
        a.account_id,
        s.type,
        s.data,
        acc.token_remaining,
        acc.topup_remaining
      FROM api_keys a
      JOIN sessions s ON s.account_id = a.account_id AND s.session_id = ${sessionId}
      JOIN accounts acc ON acc.id = a.account_id
      WHERE a.key_hash = ${keyHash}
        AND (a.expires_at IS NULL OR a.expires_at > ${now})
    `.execute(this.db);

    return rows.rows;
  }

  async overwriteConversation(accountId: string, sessionId: string, content: string): Promise<void> {
    await sql`
      UPDATE sessions
      SET data = ${content}
      WHERE account_id = ${accountId}
        AND session_id = ${sessionId}
        AND type = 'CONV'
    `.execute(this.db);
  }

  async insertUsage(
    accountId: string,
    sessionId: string,
    provider: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<void> {
    const now = new Date().toISOString();
    const totalTokens = inputTokens + outputTokens;

    // Use transaction to atomically insert usage and update credits
    await this.db.transaction().execute(async (trx) => {
      // Get current balances
      const account = await trx
        .selectFrom('accounts')
        .select(['topup_remaining', 'token_remaining'])
        .where('id', '=', accountId)
        .executeTakeFirst();

      if (!account) {
        throw new Error(`Account ${accountId} not found`);
      }

      let topupRemaining = account.topup_remaining;
      let tokenRemaining = account.token_remaining;

      // Cascading deduction: topup first, then subscription
      let remainingUsage = totalTokens;

      // Step 1: Deduct from topup (stops at 0)
      if (topupRemaining > 0) {
        if (topupRemaining >= remainingUsage) {
          topupRemaining -= remainingUsage;
          remainingUsage = 0;
        } else {
          remainingUsage -= topupRemaining;
          topupRemaining = 0;
        }
      }

      // Step 2: Deduct remainder from subscription (can go negative)
      if (remainingUsage > 0) {
        tokenRemaining -= remainingUsage;
      }

      // Insert usage record
      await trx
        .insertInto('usage_metrics')
        .values({
          account_id: accountId,
          session_id: sessionId,
          provider,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: totalTokens,
          created_at: now,
        })
        .execute();

      // Update account credits
      await trx
        .updateTable('accounts')
        .set({
          topup_remaining: topupRemaining,
          token_remaining: tokenRemaining,
          updated_at: now,
        })
        .where('id', '=', accountId)
        .execute();
    });
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
