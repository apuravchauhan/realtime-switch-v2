import { Account, CreateAccountInput } from './entities/Account';

export interface IAccountRepo {
  createAccount(input: CreateAccountInput): Promise<Account>;
  getAccount(accountId: string): Promise<Account | null>;
}
