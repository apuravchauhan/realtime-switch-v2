import { IConnectionHandler } from './IConnectionHandler';

export interface IVoiceConnection {
  connect(handler: IConnectionHandler): void;
  disconnect(): void;
  isConnected(): boolean;
  send(message: unknown): void;
}
