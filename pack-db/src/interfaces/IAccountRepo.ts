import { Account, CreateAccountInput } from './entities/Account';
import { ApiKey, CreateApiKeyInput, CreateApiKeyResult } from './entities/ApiKey';

export interface IAccountRepo {
  createAccount(input: CreateAccountInput): Promise<Account>;
  getAccount(accountId: string): Promise<Account | null>;
  createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult>;
  validateApiKey(plainKey: string): Promise<ApiKey | null>;
  getApiKeysByAccountId(accountId: string): Promise<ApiKey[]>;
  revokeApiKey(keyHash: string): Promise<boolean>;
  updateLastUsed(keyHash: string): Promise<void>;
  appendConversation(accountId: string, sessionId: string, conversationData: string): Promise<void>;
}
