export interface ApiKey {
  key_hash: string;
  account_id: string;
  key_indicator: string;
  label: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
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
