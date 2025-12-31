

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

export interface ApiKey {
  key_hash: string;
  account_id: string;
  key_indicator: string;
  label: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
}

export interface CreateAccountInput {
  email: string;
  planName?: string;
  tokenRemaining?: number;
  topupRemaining?: number;
}

export interface CreateApiKeyInput {
  accountId: string;
  label: string;
  expiresAt?: string | null;
}

export interface CreateApiKeyResult {
  apiKey: ApiKey;
  plainKey: string;
}

export interface IAccountRepo {
  createAccount(input: CreateAccountInput): Promise<Account>;
  getAccount(accountId: string): Promise<Account | null>;
  createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult>;
  validateApiKey(plainKey: string): Promise<ApiKey | null>;
  getApiKeysByAccountId(accountId: string): Promise<ApiKey[]>;
  revokeApiKey(keyHash: string): Promise<boolean>;
  updateLastUsed(keyHash: string): Promise<void>;
  getCredits(accountId: string): Promise<{ tokenRemaining: number; topupRemaining: number } | null>;
}
