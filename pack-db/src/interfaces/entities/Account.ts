import { ApiKey } from './ApiKey';

export interface Account {
  id: string;
  email: string;
  plan_name: string;
  token_remaining: number;
  topup_remaining: number;
  status: number;
  created_at: string;
  updated_at: string;
}

export interface Database {
  accounts: Account;
  api_keys: ApiKey;
}

export interface CreateAccountInput {
  email: string;
  planName?: string;
  tokenRemaining?: number;
  topupRemaining?: number;
}
