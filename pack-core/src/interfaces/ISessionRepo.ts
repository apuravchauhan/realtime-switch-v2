// Shared ISessionRepo interface - used by both pack-server (ZMQ client) and pack-db (SQLite impl)

export enum SessionType {
  SESSION = 'SESSION',
  CONV = 'CONV',
}

export interface Session {
  session_id: string;
  account_id: string;
  type: SessionType;
  data: string;  // JSON blob
  created_at: string;
}

export interface SessionData {
  sessionId: string;
  accountId: string;
  instructions?: string;
  voice?: string;
  tools?: ToolDefinition[];
  inputAudioFormat?: string;
  outputAudioFormat?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ConversationMessage {
  role: string;
  content: string;
  timestamp: string;
}

export interface SessionWithConversation {
  session: SessionData | null;
  messages: ConversationMessage[];
}

export interface ISessionRepo {
  // Load session data with conversation history
  loadSession(accountId: string, sessionId: string): Promise<SessionWithConversation>;

  // Save/update session config (upsert)
  saveSession(accountId: string, sessionId: string, data: SessionData): Promise<void>;

  // Append a conversation message
  appendConversation(accountId: string, sessionId: string, message: ConversationMessage): Promise<void>;

  // Update token usage
  updateUsage(accountId: string, sessionId: string, tokens: TokenUsage): Promise<void>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  audioDurationMs?: number;
}
