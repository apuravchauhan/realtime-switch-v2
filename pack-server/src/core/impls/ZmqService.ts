import * as zmq from 'zeromq';
import {
  ZmqMessageType,
  ZmqArgs,
  ZmqResponseData,
  ZMQ_DELIMITER,
  ZmqUtils,
  Logger,
  Config,
  ConfigKeys,
  ErrorCode,
} from 'pack-shared';

const CLASS_NAME = 'ZmqService';


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

  constructor(socketPath?: string, timeoutMs?: number) {
    this.socketPath = socketPath ?? Config.get(ConfigKeys.ZMQ_SOCKET_PATH);
    this.timeoutMs = timeoutMs ?? (Config.has(ConfigKeys.ZMQ_TIMEOUT_MS)
      ? parseInt(Config.get(ConfigKeys.ZMQ_TIMEOUT_MS), 10)
      : 5000);
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
    Logger.debug(CLASS_NAME, null, `Connected to ${this.socketPath}`);
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
      throw new Error(ErrorCode.INTERNAL_ZMQ_NOT_CONNECTED);
    }

    const message = [id, type, ...args.map(String)].join(ZMQ_DELIMITER);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(ErrorCode.INTERNAL_ZMQ_REQUEST_TIMEOUT));
      }, this.timeoutMs);

      this.pendingRequests.set(id, { type, resolve, reject, timer } as PendingRequest<RequestResponseType>);

      this.dealer.send(['', message]).catch((err) => {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(err);
      });
    });
  }

  
  sendFireAndForget<T extends ZmqMessageType>(
    id: string,
    type: T,
    ...args: ZmqArgs[T]
  ): void {
    if (!this.connected) {
      Logger.error(CLASS_NAME, null, `Not connected, dropping fire-and-forget message: ${type}`, new Error(ErrorCode.INTERNAL_ZMQ_NOT_CONNECTED));
      return;
    }

    const message = [id, type, ...args.map(String)].join(ZMQ_DELIMITER);
    this.dealer.send(['', message]).catch((err) => {
      Logger.error(CLASS_NAME, null, 'Fire-and-forget send error', err);
    });
  }

  destroy(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(ErrorCode.INTERNAL_ZMQ_DESTROYED));
    }
    this.pendingRequests.clear();

    if (this.connected) {
      this.dealer.close();
      this.connected = false;
      Logger.debug(CLASS_NAME, null, 'Destroyed');
    }
  }

  private async startReceiver(): Promise<void> {
    try {
      for await (const [delimiter, msgBuffer] of this.dealer) {
        const rawString = msgBuffer.toString();


        const firstDelim = rawString.indexOf(ZMQ_DELIMITER);
        if (firstDelim === -1) {
          Logger.error(CLASS_NAME, null, 'Invalid response format', new Error(ErrorCode.INTERNAL_ZMQ_INVALID_RESPONSE), rawString.slice(0, 100));
          continue;
        }

        const id = rawString.slice(0, firstDelim);
        const pending = this.pendingRequests.get(id);

        if (!pending) {
          Logger.error(CLASS_NAME, null, 'No pending request for id', new Error(ErrorCode.INTERNAL_ZMQ_NO_PENDING_REQUEST), id);
          continue;
        }

        const response = ZmqUtils.decodeResponse(rawString, pending.type);
        if (!response) {
          Logger.error(CLASS_NAME, null, 'Failed to decode response', new Error(ErrorCode.INTERNAL_ZMQ_DECODE_FAILED), rawString.slice(0, 100));
          continue;
        }

        clearTimeout(pending.timer);
        this.pendingRequests.delete(id);
        pending.resolve(response);
      }
    } catch (error) {
      if (this.connected) {
        Logger.error(CLASS_NAME, null, 'Receiver error', error as Error);
      }
    }
  }
}
