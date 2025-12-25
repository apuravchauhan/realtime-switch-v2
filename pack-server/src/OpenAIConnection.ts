import WebSocket from 'ws';
import { Config, ConfigKeys } from './core/impls/Config';
import { IConnectionHandler } from './core/interfaces/IConnectionHandler';

export class OpenAIConnection {
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
      const message = JSON.parse(data.toString());
      this.handler?.onMsgReceived(message);
    });
  }

  public disconnect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}
