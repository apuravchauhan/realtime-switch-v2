// Shared IUsageRepo interface - used by both pack-server (ZMQ client) and pack-db (SQLite impl)

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
  // Insert usage metrics (fire-and-forget from pack-server perspective)
  insertUsage(metrics: UsageMetrics): Promise<InsertUsageResult>;
}
