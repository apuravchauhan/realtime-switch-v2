export interface SessionRow {
  account_id: string;
  type: string;
  data: string;
  token_remaining: number;
  topup_remaining: number;
}

export interface ISessionRepo {
  upsertSession(accountId: string, sessionId: string, sessionData: string): Promise<void>;
  appendConversation(accountId: string, sessionId: string, conversationData: string): Promise<void>;
  loadSessionByKeyAndId(apiKey: string, sessionId: string): Promise<SessionRow[]>;
  overwriteConversation(accountId: string, sessionId: string, content: string): Promise<void>;
}
