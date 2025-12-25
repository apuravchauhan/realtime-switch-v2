import { IConnectionHandler } from './core/models/IConnectionHandler';
import { IVoiceConnection } from './core/models/IVoiceConnection';
import { IServiceFactory } from './core/models/IServiceFactory';
import { IAccountService } from './core/models/IAccountService';
import { ISessionService, SessionConfig } from './core/models/ISessionService';
import { IPersistenceRepo } from './core/models/IPersistenceRepo';

const MAX_BUFFER_SIZE = 10000;
const MAX_RESPONSES_BEFORE_CREDIT_CHECK = 50;

export class Orchestrator implements IConnectionHandler {
  private accountId: string;
  private sessionId: string;
  private connection: IVoiceConnection | null = null;
  private isVoiceProviderConnected = false;
  private messageBuffer: unknown[] = [];
  private availableCredits: number | null = null;
  private responseCount = 0;
  private creditsCheckInProgress = false;
  private readonly factory: IServiceFactory;
  private readonly accountService: IAccountService;
  private readonly sessionService: ISessionService;
  private readonly persistence: IPersistenceRepo;

  constructor(accountId: string, sessionId: string, factory: IServiceFactory) {
    this.accountId = accountId;
    this.sessionId = sessionId;
    this.factory = factory;
    this.accountService = factory.getAccountService();
    this.sessionService = factory.getSessionService();
    this.persistence = factory.getPersistence();
  }

  connect(): void {
    this.connection = this.factory.getNewOAIVoiceConnection();
    this.connection.connect(this);
  }

  send(message: unknown): void {
    if (this.isVoiceProviderConnected) {
      this.checkAndScheduleCreditsCheck();
      if (this.availableCredits !== null && this.availableCredits <= 0) {
        this.connection?.disconnect();
        throw new Error('NO_CREDITS');
      }
      this.connection?.send(message);
    } else {
      if (this.messageBuffer.length >= MAX_BUFFER_SIZE) {
        throw new Error('RECON_TIMED_OUT_RETRYING');
      }
      this.messageBuffer.push(message);
    }
  }

  onConnect(): void {
    this.checkAndScheduleCreditsCheck();
    this.sessionService.getSessionData(this.accountId, this.sessionId).then((sessionConfig) => {
      if (sessionConfig) {
        this.replaySession(sessionConfig);
      }
      this.isVoiceProviderConnected = true;
      this.flushBuffer();
    });
  }

  onError(error: Error): void {
    this.isVoiceProviderConnected = false;
  }

  onClose(code: number, reason: string): void {
    this.isVoiceProviderConnected = false;
  }

  onMsgReceived(message: unknown): void {
    const payload = message as { type?: string; response?: { usage?: OAIUsage } };
    if (payload.type === 'response.done' && payload.response?.usage) {
      const usage = payload.response.usage;
      if (this.availableCredits !== null) {
        this.availableCredits -= usage.total_tokens;
      }
      this.responseCount++;
      this.persistence.saveUsage(this.accountId, this.sessionId, 'OPENAI', {
        inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.total_tokens
      });
      if (this.availableCredits !== null && this.availableCredits <= 0) {
        this.connection?.disconnect();
        throw new Error('NO_CREDITS');
      }
    }
  }

  onLatencyCheck(latencyMs: number): void {
    throw new Error('Not implemented');
  }

  reconnect(): void {
    throw new Error('Not implemented');
  }

  private flushBuffer(): void {
    while (this.messageBuffer.length > 0) {
      const message = this.messageBuffer.shift();
      this.connection?.send(message);
    }
  }

  private replaySession(config: SessionConfig): void {
    const sessionMessage = { type: 'session.update', session: config };
    this.connection?.send(sessionMessage);
  }

  private checkAndScheduleCreditsCheck(): void {
    if (this.creditsCheckInProgress) return;
    if (this.availableCredits !== null && this.responseCount < MAX_RESPONSES_BEFORE_CREDIT_CHECK) return;
    this.creditsCheckInProgress = true;
    this.accountService.getCredits(this.accountId).then((credits) => {
      this.availableCredits = credits;
      this.responseCount = 0;
      this.creditsCheckInProgress = false;
    });
  }
}

interface OAIUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}
