import * as uWS from 'uWebSockets.js';
import { IAccountService, SessionData, ErrorCode, Logger } from 'pack-shared';
import { IConnectionHandler } from './core/interfaces/IConnectionHandler';
import { IVoiceConnection } from './core/interfaces/IVoiceConnection';
import { IServiceFactory } from './core/interfaces/IServiceFactory';
import { ICheckpointHandler } from './core/interfaces/ICheckpointHandler';
import { IUsageHandler } from './core/interfaces/IUsageHandler';
import { OpenAIConnection } from './OpenAIConnection';

const CLASS_NAME = 'Orchestrator';
const MAX_BUFFER_SIZE = 10000;
const MAX_RESPONSES_BEFORE_CREDIT_CHECK = 50;

export class Orchestrator implements IConnectionHandler {
  private accountId: string;
  private sessionId: string;
  private sessionData: SessionData;
  private credits: number;
  private ws: uWS.WebSocket<unknown>;
  private factory: IServiceFactory;
  private accountService: IAccountService;
  private voiceConnection: IVoiceConnection | null = null;
  private isVoiceProviderConnected = false;
  private messageBuffer: unknown[] = [];
  private responseCount = 0;
  private creditsCheckInProgress = false;
  private skipSessionSave = false;
  private checkpointHandler: ICheckpointHandler;
  private usageHandler: IUsageHandler;

  constructor(
    sessionData: SessionData,
    ws: uWS.WebSocket<unknown>,
    factory: IServiceFactory
  ) {
    this.sessionData = sessionData;
    this.accountId = sessionData.accountId;
    this.sessionId = ws.getUserData() ? (ws.getUserData() as any).sessionId : '';
    this.credits = sessionData.credits;
    this.ws = ws;
    this.factory = factory;
    this.accountService = factory.getAccountService();
    this.skipSessionSave = sessionData.sessionData.length > 0;
    this.checkpointHandler = factory.getNewCheckpointHandler(this.accountId, this.sessionId);
    this.usageHandler = factory.getNewUsageHandler(this.accountId, this.sessionId);
  }

  connect(): void {
    if (this.voiceConnection) {
      this.voiceConnection.disconnect();
    }
    this.voiceConnection = new OpenAIConnection(this);
    this.voiceConnection.connect();
  }

  send(message: unknown): void {
    if (this.isVoiceProviderConnected && this.voiceConnection) {
      this.checkAndScheduleCreditsCheck();
      if (this.credits <= 0) {
        this.voiceConnection.disconnect();
        throw new Error(ErrorCode.EXTERNAL_NO_CREDITS);
      }
      this.voiceConnection.send(message);
    } else {
      if (this.messageBuffer.length >= MAX_BUFFER_SIZE) {
        throw new Error(ErrorCode.EXTERNAL_BUFFER_OVERFLOW);
      }
      this.messageBuffer.push(message);
    }
  }

  onConnect(): void {
    this.isVoiceProviderConnected = true;
    if (this.sessionData.sessionData) {
      try {
        this.voiceConnection!.send(this.sessionData.sessionData);
      } catch (e) {
        Logger.error(CLASS_NAME, this.accountId, 'Failed to parse sessionData', e as Error);
      }
    }

    this.flushBuffer();
  }

  onError(error: Error): void {
    Logger.error(CLASS_NAME, this.accountId, 'Voice connection error', error);
    // Do NOT mark isVoiceProviderConnected as false here - only onClose should do that
    this.skipSessionSave = false;
  }

  onClose(code: number, reason: string): void {
    Logger.debug(CLASS_NAME, this.accountId, 'Voice connection closed: {} {}', code, reason);
    this.isVoiceProviderConnected = false;
    Logger.debug(CLASS_NAME, this.accountId, 'Auto-reconnecting for session: {}', this.sessionId);
    this.skipSessionSave = true;
    this.connect();
  }

  onMsgReceived(message: string): void {
    // Try to send the message. uWebSockets.js will throw if the socket is closed.
    // We cannot check the socket state beforehand since uWS doesn't provide a state API.
    try {
      this.ws.send(message);
    } catch (error) {
      Logger.warn(CLASS_NAME, this.accountId, 'Failed to send message (WebSocket likely closed): {}', (error as Error).message);
      this.cleanup();
      return;
    }

    this.trackUsage(message);
    this.saveSessionIfNeeded(message);
    this.checkpointHandler.trackConversation(message);
  }

  private saveSessionIfNeeded(message: string): void {
    // Use indexOf to check for type field
    if (message.indexOf('"type":"session.updated"') === -1) return;

    if (this.skipSessionSave) {
      this.skipSessionSave = false;
      return;
    }
    this.accountService.saveSession(this.accountId, this.sessionId, message);
  }

  private trackUsage(message: string): void {
    const tokens = this.usageHandler.saveUsage(message);
    if (tokens) {
      const totalTokens = tokens.inputTokens + tokens.outputTokens;
      this.credits -= totalTokens;
      this.responseCount++;
      if (this.credits <= 0) {
        this.voiceConnection?.disconnect();
        throw new Error(ErrorCode.EXTERNAL_NO_CREDITS);
      }
    }
  }

  onLatencyCheck(latencyMs: number): void {
    // TODO: implement latency tracking
  }

  cleanup(): void {
    this.usageHandler.flush();
    this.checkpointHandler.flush();

    this.voiceConnection?.disconnect();
    this.messageBuffer = [];
    Logger.debug(CLASS_NAME, this.accountId, 'Cleanup completed for session: {}', this.sessionId);
  }

  private flushBuffer(): void {
    while (this.messageBuffer.length > 0) {
      const message = this.messageBuffer.shift();
      this.voiceConnection!.send(message);
    }
  }

  private checkAndScheduleCreditsCheck(): void {
    if (this.creditsCheckInProgress) return;
    if (this.responseCount < MAX_RESPONSES_BEFORE_CREDIT_CHECK) return;

    this.creditsCheckInProgress = true;
    this.accountService.getCredits(this.accountId).then((credits) => {
      this.credits = credits;
      this.responseCount = 0;
      this.creditsCheckInProgress = false;
    }).catch((err) => {
      Logger.error(CLASS_NAME, this.accountId, 'Failed to fetch credits', err);
      this.creditsCheckInProgress = false;
    });
  }
}
