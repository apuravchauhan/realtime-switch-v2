import * as zmq from 'zeromq';
import {
  ZmqMessageType,
  ZmqArgs,
  ZmqResponseData,
  ZMQ_DELIMITER,
  ZmqUtils,
} from 'pack-shared';

const DEFAULT_SOCKET_PATH = 'ipc:///tmp/rs-pack-db.sock';
const DEFAULT_TIMEOUT_MS = 5000;

// Message types that expect a response
type RequestResponseType = keyof ZmqResponseData;

interface PendingRequest<T extends RequestResponseType> {
  type: T;
  resolve: (response: { id: string } & ZmqResponseData[T]) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class ZmqService {
  private dealer: zmq.Dealer;
  private connected = false;
  private pendingRequests = new Map<string, PendingRequest<RequestResponseType>>();
  private socketPath: string;
  private timeoutMs: number;

  constructor(socketPath: string = DEFAULT_SOCKET_PATH, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    this.socketPath = socketPath;
    this.timeoutMs = timeoutMs;
    this.dealer = new zmq.Dealer();
    this.dealer.routingId = `pack-server-${process.pid}`;
    this.dealer.sendHighWaterMark = 1000;
    this.dealer.receiveHighWaterMark = 1000;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    await this.dealer.connect(this.socketPath);
    this.connected = true;
    this.startReceiver();
    console.log(`[ZmqService] Connected to ${this.socketPath}`);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async send<T extends RequestResponseType>(
    id: string,
    type: T,
    ...args: ZmqArgs[T]
  ): Promise<{ id: string } & ZmqResponseData[T]> {
    if (!this.connected) {
      throw new Error('[ZmqService] Not connected');
    }

    const message = [id, type, ...args.map(String)].join(ZMQ_DELIMITER);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`[ZmqService] Request timeout: ${type}`));
      }, this.timeoutMs);

      this.pendingRequests.set(id, { type, resolve, reject, timer } as PendingRequest<RequestResponseType>);

      this.dealer.send(['', message]).catch((err) => {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(err);
      });
    });
  }

  // Fire and forget - no response expected
  sendFireAndForget<T extends ZmqMessageType>(
    id: string,
    type: T,
    ...args: ZmqArgs[T]
  ): void {
    if (!this.connected) {
      console.error('[ZmqService] Not connected, dropping fire-and-forget message:', type);
      return;
    }

    const message = [id, type, ...args.map(String)].join(ZMQ_DELIMITER);
    this.dealer.send(['', message]).catch((err) => {
      console.error('[ZmqService] Fire-and-forget send error:', err);
    });
  }

  destroy(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('ZmqService destroyed'));
    }
    this.pendingRequests.clear();

    if (this.connected) {
      this.dealer.close();
      this.connected = false;
      console.log('[ZmqService] Destroyed');
    }
  }

  private async startReceiver(): Promise<void> {
    try {
      for await (const [delimiter, msgBuffer] of this.dealer) {
        const rawString = msgBuffer.toString();

        // Extract id from first part to find pending request
        const firstDelim = rawString.indexOf(ZMQ_DELIMITER);
        if (firstDelim === -1) {
          console.error('[ZmqService] Invalid response format:', rawString.slice(0, 100));
          continue;
        }

        const id = rawString.slice(0, firstDelim);
        const pending = this.pendingRequests.get(id);

        if (!pending) {
          console.error('[ZmqService] No pending request for id:', id);
          continue;
        }

        const response = ZmqUtils.decodeResponse(rawString, pending.type);
        if (!response) {
          console.error('[ZmqService] Failed to decode response:', rawString.slice(0, 100));
          continue;
        }

        clearTimeout(pending.timer);
        this.pendingRequests.delete(id);
        pending.resolve(response);
      }
    } catch (error) {
      if (this.connected) {
        console.error('[ZmqService] Receiver error:', error);
      }
    }
  }
}
