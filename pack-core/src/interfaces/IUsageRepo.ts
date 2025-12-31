

export interface UsageMetrics {
  accountId: string;
  sessionId: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  audioDurationMs?: number;
}

export interface InsertUsageResult {
  success: boolean;
  remainingCredits?: number;
}

export interface IUsageRepo {
  
  insertUsage(metrics: UsageMetrics): Promise<InsertUsageResult>;
}
