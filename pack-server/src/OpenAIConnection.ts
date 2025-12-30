import WebSocket from 'ws';
import { Config, ConfigKeys } from './core/impls/Config';
import { IConnectionHandler } from './core/interfaces/IConnectionHandler';
import { IVoiceConnection } from './core/interfaces/IVoiceConnection';

export class OpenAIConnection implements IVoiceConnection {
  private ws: WebSocket | null = null;
  private readonly url = 'wss://api.openai.com/v1/realtime?model=gpt-realtime';
  private handler: IConnectionHandler | null = null;
  private isConnectionEstablished = false;

  public connect(handler: IConnectionHandler): void {
    this.handler = handler;

    const apiKey = Config.getInstance().get(ConfigKeys.OPENAI_API_KEY);

    this.ws = new WebSocket(this.url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    this.ws.on('open', () => {
      this.isConnectionEstablished = true;
      this.handler?.onConnect();
    });

    this.ws.on('error', (error) => {
      this.handler?.onError(error);
    });

    this.ws.on('close', (code, reason) => {
      this.isConnectionEstablished = false;
      this.handler?.onClose(code, reason.toString());
      this.ws = null;
    });

    this.ws.on('message', (data) => {
      this.handler?.onMsgReceived(data.toString());
    });
  }

  public disconnect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.handler = null;
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public send(message: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const data = typeof message === 'string' ? message : JSON.stringify(message);
      this.ws.send(data);
    }
  }
}
