export interface ISessionService {
  getSessionData(accountId: string, sessionId: string): Promise<SessionConfig | null>;
  saveSessionConfig(accountId: string, sessionId: string, config: SessionConfig): Promise<void>;
  appendConversation(accountId: string, sessionId: string, content: string): Promise<void>;
}

export interface SessionConfig {
  sessionId: string;
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
