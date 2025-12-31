export interface IUsageHandler {
  saveUsage(message: string): { inputTokens: number, outputTokens: number } | null;
  flush(): void;
}
