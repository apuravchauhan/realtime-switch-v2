export interface IConnectionHandler {
  onConnect(): void;
  onError(error: Error): void;
  onClose(code: number, reason: string): void;
  onMsgReceived(message: unknown): void;
  onLatencyCheck(latencyMs: number): void;
}
