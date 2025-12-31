import * as zmq from 'zeromq';
import {
  ZmqMessageType,
  ZMQ_FIRE_AND_FORGET,
  IAccountService,
  ZmqUtils,
} from 'pack-shared';

const DEFAULT_SOCKET_PATH = 'ipc:///tmp/rs-pack-db.sock';

export class ZmqHandler {
  private router: zmq.Router;
  private accountService: IAccountService;
  private running = false;

  constructor(accountService: IAccountService) {
    this.accountService = accountService;
    this.router = new zmq.Router();
    this.router.sendHighWaterMark = 10000;
    this.router.receiveHighWaterMark = 10000;
  }

  async start(socketPath: string = DEFAULT_SOCKET_PATH): Promise<void> {
    await this.router.bind(socketPath);
    this.running = true;
    console.log(`[ZmqHandler] Listening on ${socketPath}`);
    this.listen();
  }

  private async listen(): Promise<void> {
    try {
      for await (const [identity, delimiter, msgBuffer] of this.router) {
        if (!this.running) break;
        this.handleMessage(identity, delimiter, msgBuffer.toString());
      }
    } catch (error) {
      if (this.running) console.error('[ZmqHandler] Listen error:', error);
    }
  }

  private async handleMessage(identity: Buffer, delimiter: Buffer, rawString: string): Promise<void> {
    const request = ZmqUtils.decodeRequest(rawString);

    if (!request) {
      console.error('[ZmqHandler] Failed to decode request:', rawString.slice(0, 100));
      return;
    }

    const { id, type, args } = request;

    // Fire-and-forget: process without sending response
    if (ZMQ_FIRE_AND_FORGET.has(type)) {
      try {
        await this.processFireAndForget(type, args);
      } catch (error) {
        console.error('[ZmqHandler] Fire-and-forget error:', type, error);
      }
      return;
    }

    // Request-response: process and send response
    try {
      const response = await this.processRequest(id, type, args);
      await this.router.send([identity, delimiter, response]);
    } catch (error) {
      console.error('[ZmqHandler] Error processing:', type, error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await this.router.send([identity, delimiter, ZmqUtils.encodeResponse(id, type, errorMsg)]);
    }
  }

  private async processFireAndForget(
    type: ZmqMessageType,
    args: Record<string, string | number>
  ): Promise<void> {
    switch (type) {
      case ZmqMessageType.UPDATE_USAGE: {
        const { accountId, sessionId, provider, inputTokens, outputTokens } = args as {
          accountId: string;
          sessionId: string;
          provider: string;
          inputTokens: number;
          outputTokens: number;
        };
        this.accountService.updateUsage(accountId, sessionId, provider, inputTokens, outputTokens);
        break;
      }
      case ZmqMessageType.SAVE_SESSION: {
        const { accountId, sessionId, sessionData } = args as {
          accountId: string;
          sessionId: string;
          sessionData: string;
        };
        this.accountService.saveSession(accountId, sessionId, sessionData);
        break;
      }
      case ZmqMessageType.APPEND_CONVERSATION: {
        const { accountId, sessionId, conversationData } = args as {
          accountId: string;
          sessionId: string;
          conversationData: string;
        };
        this.accountService.appendConversation(accountId, sessionId, conversationData);
        break;
      }
      default:
        console.error('[ZmqHandler] Unknown fire-and-forget type:', type);
    }
  }

  private async processRequest(
    id: string,
    type: ZmqMessageType,
    args: Record<string, string | number>
  ): Promise<string> {
    switch (type) {
      case ZmqMessageType.VALIDATE_AND_LOAD: {
        const { apiKey, sessionId } = args as { apiKey: string; sessionId: string };
        const data = await this.accountService.validateAndLoad(apiKey, sessionId);
        return ZmqUtils.encodeResponse(id, type, data.error, data.accountId, data.sessionData, data.credits);
      }
      case ZmqMessageType.GET_CREDITS: {
        const { accountId } = args as { accountId: string };
        const credits = await this.accountService.getCredits(accountId);
        return ZmqUtils.encodeResponse(id, type, '', credits);
      }
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    this.router.close();
    console.log('[ZmqHandler] Stopped');
  }
}
