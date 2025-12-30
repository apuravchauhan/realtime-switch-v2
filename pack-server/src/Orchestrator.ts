import * as uWS from 'uWebSockets.js';
import { IAccountService } from 'pack-shared';
import { IConnectionHandler } from './core/interfaces/IConnectionHandler';
import { IVoiceConnection } from './core/interfaces/IVoiceConnection';
import { IServiceFactory } from './core/interfaces/IServiceFactory';

const MAX_BUFFER_SIZE = 10000;
const MAX_RESPONSES_BEFORE_CREDIT_CHECK = 50;

export class Orchestrator implements IConnectionHandler {
  private accountId: string;
  private sessionId: string;
  private sessionData: string;
  private credits: number;
  private ws: uWS.WebSocket<unknown>;
  private factory: IServiceFactory;
  private accountService: IAccountService;
  private voiceConnection: IVoiceConnection | null = null;
  private isVoiceProviderConnected = false;
  private messageBuffer: unknown[] = [];
  private responseCount = 0;
  private creditsCheckInProgress = false;

  constructor(
    accountId: string,
    sessionId: string,
    sessionData: string,
    credits: number,
    ws: uWS.WebSocket<unknown>,
    factory: IServiceFactory
  ) {
    this.accountId = accountId;
    this.sessionId = sessionId;
    this.sessionData = sessionData;
    this.credits = credits;
    this.ws = ws;
    this.factory = factory;
    this.accountService = factory.getAccountService();
  }

  connect(): void {
    this.voiceConnection = this.factory.getNewVoiceConnection();
    this.voiceConnection.connect(this);
  }

  // Called when client sends a message - pipe to voice provider
  send(message: unknown): void {
    if (this.isVoiceProviderConnected && this.voiceConnection) {
      // Check credits before sending
      this.checkAndScheduleCreditsCheck();
      if (this.credits <= 0) {
        this.voiceConnection.disconnect();
        throw new Error('NO_CREDITS');
      }
      this.voiceConnection.send(message);
    } else {
      if (this.messageBuffer.length >= MAX_BUFFER_SIZE) {
        throw new Error('BUFFER_OVERFLOW');
      }
      this.messageBuffer.push(message);
    }
  }

  // IConnectionHandler - voice provider connected
  onConnect(): void {
    this.isVoiceProviderConnected = true;

    // Send session config if available
    if (this.sessionData) {
      try {
        this.voiceConnection!.send(this.sessionData);
      } catch (e) {
        console.error('[Orchestrator] Failed to parse sessionData:', e);
      }
    }

    this.flushBuffer();
  }

  // IConnectionHandler - voice provider error
  onError(error: Error): void {
    console.error(`[Orchestrator] Voice connection error for ${this.accountId}:`, error);
    this.isVoiceProviderConnected = false;
  }

  // IConnectionHandler - voice provider closed
  onClose(code: number, reason: string): void {
    console.log(`[Orchestrator] Voice connection closed for ${this.accountId}: ${code} ${reason}`);
    this.isVoiceProviderConnected = false;
  }

  // IConnectionHandler - message from voice provider -> pipe to client
  onMsgReceived(message: string): void {
    // Pipe to client WebSocket
    this.ws.send(message);

    // Track usage if response.done
    this.trackUsage(message);
  }

  private trackUsage(message: string): void {
    // startsWith is O(prefix length), not O(n) - fast early exit for most messages
    if (!message.startsWith('{"type":"response.done"')) return;

    // Extract input_tokens
    const inputIdx = message.indexOf('"input_tokens":');
    if (inputIdx === -1) return;

    let inputStart = inputIdx + 15; // length of '"input_tokens":'
    let inputEnd = inputStart;
    while (message.charCodeAt(inputEnd) >= 48 && message.charCodeAt(inputEnd) <= 57) inputEnd++;
    if (inputEnd === inputStart) return;
    const inputTokens = parseInt(message.slice(inputStart, inputEnd), 10);

    // Extract output_tokens - search from inputEnd for efficiency
    const outputIdx = message.indexOf('"output_tokens":', inputEnd);
    if (outputIdx === -1) return;

    let outputStart = outputIdx + 16; // length of '"output_tokens":'
    let outputEnd = outputStart;
    while (message.charCodeAt(outputEnd) >= 48 && message.charCodeAt(outputEnd) <= 57) outputEnd++;
    if (outputEnd === outputStart) return;
    const outputTokens = parseInt(message.slice(outputStart, outputEnd), 10);

    // Update credits and response count
    const totalTokens = inputTokens + outputTokens;
    this.credits -= totalTokens;
    this.responseCount++;

    // Persist usage (fire and forget)
    this.accountService.updateUsage(this.accountId, this.sessionId, 'OPENAI', inputTokens, outputTokens);

    // Check if credits depleted
    if (this.credits <= 0) {
      this.voiceConnection?.disconnect();
      throw new Error('NO_CREDITS');
    }
  }

  onLatencyCheck(latencyMs: number): void {
    // TODO: implement latency tracking
  }

  cleanup(): void {
    if (this.voiceConnection?.isConnected()) {
      this.voiceConnection.disconnect();
    }
    this.messageBuffer = [];
    console.log(`[Orchestrator] Cleanup completed for ${this.accountId}:${this.sessionId}`);
  }

  private flushBuffer(): void {
    while (this.messageBuffer.length > 0) {
      const message = this.messageBuffer.shift();
      this.voiceConnection!.send(message);
    }
  }

  private checkAndScheduleCreditsCheck(): void {
    // Skip if check already in progress
    if (this.creditsCheckInProgress) return;

    // Skip if not yet time for periodic check
    if (this.responseCount < MAX_RESPONSES_BEFORE_CREDIT_CHECK) return;

    this.creditsCheckInProgress = true;
    this.accountService.getCredits(this.accountId).then((credits) => {
      this.credits = credits;
      this.responseCount = 0;
      this.creditsCheckInProgress = false;
    }).catch((err) => {
      console.error('[Orchestrator] Failed to fetch credits:', err);
      this.creditsCheckInProgress = false;
    });
  }
}
