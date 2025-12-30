// SessionData matches ZmqResponseData[VALIDATE_AND_LOAD]
// error: empty string = success, non-empty = error message
export interface SessionData {
  error: string;
  accountId: string;
  sessionData: string;
  credits: number;
}

export interface IAccountService {
  validateAndLoad(apiKey: string, sessionId: string): Promise<SessionData>;
  updateUsage(accountId: string, sessionId: string, provider: string, inputTokens: number, outputTokens: number): void;
  getCredits(accountId: string): Promise<number>;
}
