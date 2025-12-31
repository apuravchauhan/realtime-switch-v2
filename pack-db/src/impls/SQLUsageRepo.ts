import { Kysely } from 'kysely';
import { IUsageRepo } from '../interfaces/IUsageRepo';
import { Database } from '../interfaces/entities/Account';

export class SQLUsageRepo implements IUsageRepo {
  constructor(private db: Kysely<Database>) {}

  async insertUsage(
    accountId: string,
    sessionId: string,
    provider: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<void> {
    const now = new Date().toISOString();
    const totalTokens = inputTokens + outputTokens;

    await this.db.transaction().execute(async (trx) => {
      // Get current account balances
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

      // Deduct usage from balances
      let remainingUsage = totalTokens;

      // First deduct from topup credits
      if (topupRemaining > 0) {
        if (topupRemaining >= remainingUsage) {
          topupRemaining -= remainingUsage;
          remainingUsage = 0;
        } else {
          remainingUsage -= topupRemaining;
          topupRemaining = 0;
        }
      }

      // Then deduct from plan credits
      if (remainingUsage > 0) {
        tokenRemaining -= remainingUsage;
      }

      // Insert usage metric
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

      // Update account balances
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
}
