export interface Account {
  id: string;
  email: string;
  api_key: string;
  plan_name: string;
  token_remaining: number;
  topup_remaining: number;
  status: number;
  created_at: number;
  updated_at: number;
}

export interface Database {
  accounts: Account;
}

export interface CreateAccountInput {
  email: string;
  planName?: string;
  tokenRemaining?: number;
  topupRemaining?: number;
}
