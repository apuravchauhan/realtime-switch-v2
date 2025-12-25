import { Kysely } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import { IAccountRepo } from '../interfaces/IAccountRepo';
import { Account, CreateAccountInput, Database } from '../interfaces/entities/Account';

const PLAN_DEFAULTS: Record<string, number> = { Free: 1000, Pro: 50000, Enterprise: 500000 };

export class SQLiteAccountRepo implements IAccountRepo {
  constructor(private db: Kysely<Database>) {}

  async createAccount(input: CreateAccountInput): Promise<Account> {
    const now = Math.floor(Date.now() / 1000);
    const planName = input.planName ?? 'Free';
    const row: Account = {
      id: uuidv4(),
      email: input.email,
      api_key: `rs_${uuidv4().replace(/-/g, '')}`,
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
}
