export interface IUsageRepo {
  insertUsage(
    accountId: string,
    sessionId: string,
    provider: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<void>;
}
