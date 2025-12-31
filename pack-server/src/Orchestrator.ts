import * as uWS from 'uWebSockets.js';
import { IAccountService } from 'pack-shared';
import { IConnectionHandler } from './core/interfaces/IConnectionHandler';
import { IVoiceConnection } from './core/interfaces/IVoiceConnection';
import { IServiceFactory } from './core/interfaces/IServiceFactory';
import { ICheckpointHandler } from './core/interfaces/ICheckpointHandler';

const MAX_BUFFER_SIZE = 10000;
const MAX_RESPONSES_BEFORE_CREDIT_CHECK = 50;
const USAGE_BATCH_SIZE = 5;

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
  private usageBuffer = { inputTokens: 0, outputTokens: 0 };
  private usageResponseCount = 0;
  private skipSessionSave = false;
  private checkpointHandler: ICheckpointHandler;

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
    this.skipSessionSave = sessionData.length > 0;
    this.checkpointHandler = factory.getNewCheckpointHandler(accountId, sessionId);
  }

  connect(): void {
    if (this.voiceConnection) {
      this.voiceConnection.disconnect();
    }
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
        const sessionEvent = JSON.parse(this.sessionData);
        const instructions = sessionEvent.session?.instructions || '';
        const instructionsPreview = instructions.length > 200
          ? instructions.substring(0, 200) + '...'
          : instructions;
        console.log(`[Orchestrator] Sending session.update for ${this.accountId}:${this.sessionId}`);
        console.log(`[Orchestrator] Instructions (${instructions.length} chars): ${instructionsPreview}`);

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
    this.skipSessionSave = false;
  }

  // IConnectionHandler - voice provider closed
  onClose(code: number, reason: string): void {
    console.log(`[Orchestrator] Voice connection closed for ${this.accountId}: ${code} ${reason}`);
    this.isVoiceProviderConnected = false;

    console.log(`[Orchestrator] Auto-reconnecting for ${this.accountId}:${this.sessionId}`);
    this.skipSessionSave = true;
    this.connect();
  }

  // IConnectionHandler - message from voice provider -> pipe to client
  onMsgReceived(message: string): void {
    // Pipe to client WebSocket
    this.ws.send(message);

    // Track usage if response.done
    this.trackUsage(message);
    this.saveSessionIfNeeded(message);
    this.checkpointHandler.trackConversation(message);
  }

  private saveSessionIfNeeded(message: string): void {
    if (!message.startsWith('{"type":"session.updated"')) return;

    if (this.skipSessionSave) {
      this.skipSessionSave = false;
      return;
    }

    // Send raw session.updated event to DB service for processing
    this.accountService.saveSession(this.accountId, this.sessionId, message);
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

    // Buffer usage for batched updates
    this.usageBuffer.inputTokens += inputTokens;
    this.usageBuffer.outputTokens += outputTokens;
    this.usageResponseCount++;

    // Flush when batch size reached
    if (this.usageResponseCount >= USAGE_BATCH_SIZE) {
      this.flushUsageBuffer();
    }

    // Check if credits depleted
    if (this.credits <= 0) {
      this.voiceConnection?.disconnect();
      throw new Error('NO_CREDITS');
    }
  }

  private flushUsageBuffer(): void {
    if (this.usageResponseCount === 0) return; // Nothing to flush

    // Send batched usage
    this.accountService.updateUsage(
      this.accountId,
      this.sessionId,
      'OPENAI',
      this.usageBuffer.inputTokens,
      this.usageBuffer.outputTokens
    );

    // Reset buffer
    this.usageBuffer = { inputTokens: 0, outputTokens: 0 };
    this.usageResponseCount = 0;
  }

  onLatencyCheck(latencyMs: number): void {
    // TODO: implement latency tracking
  }

  cleanup(): void {
    // Flush any pending usage before cleanup
    this.flushUsageBuffer();
    this.checkpointHandler.flush();

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
