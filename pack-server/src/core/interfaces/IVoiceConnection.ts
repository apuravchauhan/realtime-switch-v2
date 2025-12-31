export interface IVoiceConnection {
  connect(): void;
  disconnect(): void;
  isConnected(): boolean;
  send(message: unknown): void;
}
