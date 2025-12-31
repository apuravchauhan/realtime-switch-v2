import { randomUUID } from 'crypto';
import { IAccountService, SessionData, ZmqMessageType } from 'pack-shared';
import { ZmqService } from './ZmqService';

export class AccountServiceZmq implements IAccountService {
  private zmqService: ZmqService;

  constructor(zmqService: ZmqService) {
    this.zmqService = zmqService;
  }

  async validateAndLoad(apiKey: string, sessionId: string): Promise<SessionData> {
    const id = randomUUID();
    const { id: _, ...sessionData } = await this.zmqService.send(id, ZmqMessageType.VALIDATE_AND_LOAD, apiKey,
      sessionId);
    return sessionData;
  }

  updateUsage(accountId: string, sessionId: string, provider: string, inputTokens: number, outputTokens: number): void {
    const id = randomUUID();
    this.zmqService.sendFireAndForget(id, ZmqMessageType.UPDATE_USAGE, accountId, sessionId, provider, inputTokens,
      outputTokens);
  }

  async getCredits(accountId: string): Promise<number> {
    const id = randomUUID();
    const response = await this.zmqService.send(id, ZmqMessageType.GET_CREDITS, accountId);
    return response.credits;
  }

  saveSession(accountId: string, sessionId: string, sessionData: string): void {
    const id = randomUUID();
    this.zmqService.sendFireAndForget(id, ZmqMessageType.SAVE_SESSION, accountId, sessionId, sessionData);
  }

  appendConversation(accountId: string, sessionId: string, conversationData: string): void {
    const id = randomUUID();
    this.zmqService.sendFireAndForget(id, ZmqMessageType.APPEND_CONVERSATION, accountId, sessionId, conversationData);
  }
}
