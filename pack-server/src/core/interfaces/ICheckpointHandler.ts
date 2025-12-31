export interface ICheckpointHandler {
  trackConversation(message: string): void;
  flush(): void;
}
