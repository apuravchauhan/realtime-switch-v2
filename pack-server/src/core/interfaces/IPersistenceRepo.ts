export interface IPersistenceRepo {
  append(accountId: string, category: string, sessionId: string, content: string): Promise<void>;
  read(accountId: string, category: string, sessionId: string): Promise<string | null>;
  exists(accountId: string, category: string, sessionId: string): Promise<boolean>;
  delete(accountId: string, category: string, sessionId: string): Promise<void>;
  saveUsage(accountId: string, sessionId: string, provider: string, tokens: TokenUsage): Promise<void>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  audioDurationMs?: number;
}
