import { describe, it, expect, beforeEach } from 'vitest';
import { Orchestrator } from '../src/Orchestrator';
import { OrchestratorTestCases } from './OrchestratorTestCases';
import { IServiceFactory } from '../src/core/models/IServiceFactory';
import { IAccountService } from '../src/core/models/IAccountService';
import { ISessionService, SessionConfig } from '../src/core/models/ISessionService';
import { IPersistenceRepo, TokenUsage } from '../src/core/models/IPersistenceRepo';
import { IVoiceConnection } from '../src/core/models/IVoiceConnection';
import { IConnectionHandler } from '../src/core/models/IConnectionHandler';

class MockAccountService implements IAccountService {
  credits = 1000;
  validateAccount(accountId: string, apiKey: string): Promise<boolean> { return Promise.resolve(true); }
  getCredits(accountId: string): Promise<number> { return Promise.resolve(this.credits); }
  deductCredits(accountId: string, amount: number): Promise<void> { return Promise.resolve(); }
  hasEnoughCredits(accountId: string): Promise<boolean> { return Promise.resolve(this.credits > 0); }
}

class MockSessionService implements ISessionService {
  sessionData: SessionConfig | null = null;
  savedConfig: SessionConfig | null = null;
  appendedContent: string[] = [];
  getSessionData(accountId: string, sessionId: string): Promise<SessionConfig | null> {
    return Promise.resolve(this.sessionData);
  }
  saveSessionConfig(accountId: string, sessionId: string, config: SessionConfig): Promise<void> {
    this.savedConfig = config;
    return Promise.resolve();
  }
  appendConversation(accountId: string, sessionId: string, content: string): Promise<void> {
    this.appendedContent.push(content);
    return Promise.resolve();
  }
}

class MockPersistence implements IPersistenceRepo {
  savedUsage: { accountId: string; sessionId: string; provider: string; tokens: TokenUsage }[] = [];
  append(accountId: string, category: string, sessionId: string, content: string): Promise<void> {
    return Promise.resolve();
  }
  read(accountId: string, category: string, sessionId: string): Promise<string | null> {
    return Promise.resolve(null);
  }
  exists(accountId: string, category: string, sessionId: string): Promise<boolean> {
    return Promise.resolve(false);
  }
  delete(accountId: string, category: string, sessionId: string): Promise<void> {
    return Promise.resolve();
  }
  saveUsage(accountId: string, sessionId: string, provider: string, tokens: TokenUsage): Promise<void> {
    this.savedUsage.push({ accountId, sessionId, provider, tokens });
    return Promise.resolve();
  }
}

class MockVoiceConnection implements IVoiceConnection {
  handler: IConnectionHandler | null = null;
  sentMessages: unknown[] = [];
  connected = false;
  disconnected = false;
  connect(handler: IConnectionHandler): void {
    this.handler = handler;
    this.connected = true;
    setTimeout(() => handler.onConnect(), 0);
  }
  disconnect(): void { this.disconnected = true; this.connected = false; }
  isConnected(): boolean { return this.connected; }
  send(message: unknown): void { this.sentMessages.push(message); }
}

class MockServiceFactory implements IServiceFactory {
  accountService = new MockAccountService();
  sessionService = new MockSessionService();
  persistence = new MockPersistence();
  voiceConnection = new MockVoiceConnection();
  getAccountService(): IAccountService { return this.accountService; }
  getSessionService(): ISessionService { return this.sessionService; }
  getPersistence(): IPersistenceRepo { return this.persistence; }
  getNewOAIVoiceConnection(): IVoiceConnection { return this.voiceConnection; }
}

describe('Orchestrator', () => {
  let factory: MockServiceFactory;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    factory = new MockServiceFactory();
    orchestrator = new Orchestrator('test-account', 'test-session', factory);
  });

  it(OrchestratorTestCases.CREDITS_LOADED_ON_CONNECT, async () => {
    factory.accountService.credits = 1000;
    orchestrator.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((orchestrator as any).availableCredits).toBe(1000);
  });

  it(OrchestratorTestCases.CREDITS_DEDUCTED_AFTER_RESPONSE, async () => {
    factory.accountService.credits = 1000;
    orchestrator.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    orchestrator.onMsgReceived({ type: 'response.done', response: { usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } } });
    expect((orchestrator as any).availableCredits).toBe(970);
  });

  it(OrchestratorTestCases.NO_CREDITS_ERROR_WHEN_DEPLETED, async () => {
    factory.accountService.credits = 50;
    orchestrator.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    orchestrator.onMsgReceived({ type: 'response.done', response: { usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } } });
    expect(() => {
      orchestrator.onMsgReceived({ type: 'response.done', response: { usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } } });
    }).toThrow('NO_CREDITS');
  });

  it(OrchestratorTestCases.MESSAGES_BUFFERED_BEFORE_CONNECT, () => {
    orchestrator.send({ type: 'test1' });
    orchestrator.send({ type: 'test2' });
    expect((orchestrator as any).messageBuffer).toHaveLength(2);
  });

  it(OrchestratorTestCases.BUFFER_OVERFLOW_ERROR, () => {
    for (let i = 0; i < 10000; i++) {
      orchestrator.send({ type: `test${i}` });
    }
    expect(() => orchestrator.send({ type: 'overflow' })).toThrow('RECON_TIMED_OUT_RETRYING');
  });

  it(OrchestratorTestCases.NEW_SESSION_SAVED, async () => {
    factory.sessionService.sessionData = null;
    orchestrator.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    orchestrator.send({ type: 'session.update', session: { sessionId: 'test-session', instructions: 'test' } });
    expect(factory.voiceConnection.sentMessages).toContainEqual({ type: 'session.update', session: { sessionId: 'test-session', instructions: 'test' } });
  });

  it(OrchestratorTestCases.EXISTING_SESSION_REPLAYED, async () => {
    factory.sessionService.sessionData = { sessionId: 'test-session', instructions: 'existing instructions' };
    orchestrator.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(factory.voiceConnection.sentMessages).toContainEqual({
      type: 'session.update', session: { sessionId: 'test-session', instructions: 'existing instructions' }
    });
  });

  it(OrchestratorTestCases.LARGE_CONV_SUMMARIZED, async () => {
    factory.sessionService.sessionData = { sessionId: 'test-session', instructions: 'summarized: previous long conversation' };
    orchestrator.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(factory.voiceConnection.sentMessages).toContainEqual({
      type: 'session.update', session: { sessionId: 'test-session', instructions: 'summarized: previous long conversation' }
    });
  });

  it(OrchestratorTestCases.SESSION_UPDATE_MERGED, async () => {
    factory.sessionService.sessionData = { sessionId: 'test-session', instructions: 'original' };
    orchestrator.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    // TODO: Implement session update merge logic and test
  });

  it(OrchestratorTestCases.RECONNECT_WITH_MERGED_SESSION, async () => {
    factory.sessionService.sessionData = { sessionId: 'test-session', instructions: 'merged with conv log' };
    orchestrator.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(factory.voiceConnection.sentMessages).toContainEqual({
      type: 'session.update', session: { sessionId: 'test-session', instructions: 'merged with conv log' }
    });
  });

  it(OrchestratorTestCases.CREDITS_CHECK_AFTER_X_RESPONSES, async () => {
    factory.accountService.credits = 10000;
    orchestrator.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const initialCredits = (orchestrator as any).availableCredits;
    for (let i = 0; i < 49; i++) {
      orchestrator.onMsgReceived({ type: 'response.done', response: { usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } });
    }
    expect((orchestrator as any).responseCount).toBe(49);
    orchestrator.onMsgReceived({ type: 'response.done', response: { usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } });
    expect((orchestrator as any).responseCount).toBe(50);
  });

  it(OrchestratorTestCases.ON_ERROR_DISCONNECTS, () => {
    orchestrator.connect();
    (orchestrator as any).isVoiceProviderConnected = true;
    orchestrator.onError(new Error('test error'));
    expect((orchestrator as any).isVoiceProviderConnected).toBe(false);
  });

  it(OrchestratorTestCases.ON_CLOSE_DISCONNECTS, () => {
    orchestrator.connect();
    (orchestrator as any).isVoiceProviderConnected = true;
    orchestrator.onClose(1000, 'normal close');
    expect((orchestrator as any).isVoiceProviderConnected).toBe(false);
  });

  it(OrchestratorTestCases.RECONNECT_SAME_SESSION, () => {
    // TODO: Implement reconnect logic and test
    expect((orchestrator as any).accountId).toBe('test-account');
    expect((orchestrator as any).sessionId).toBe('test-session');
  });

  it(OrchestratorTestCases.SEND_WHEN_CONNECTED, async () => {
    factory.accountService.credits = 1000;
    orchestrator.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    orchestrator.send({ type: 'direct-message' });
    expect(factory.voiceConnection.sentMessages).toContainEqual({ type: 'direct-message' });
    expect((orchestrator as any).messageBuffer).toHaveLength(0);
  });

  it(OrchestratorTestCases.BUFFER_ORDER_PRESERVED, async () => {
    orchestrator.send({ type: 'msg1' });
    orchestrator.send({ type: 'msg2' });
    orchestrator.send({ type: 'msg3' });
    const buffer = (orchestrator as any).messageBuffer;
    expect(buffer[0]).toEqual({ type: 'msg1' });
    expect(buffer[1]).toEqual({ type: 'msg2' });
    expect(buffer[2]).toEqual({ type: 'msg3' });
  });

  it(OrchestratorTestCases.FLUSH_BUFFER_ON_CONNECT, async () => {
    orchestrator.send({ type: 'buffered1' });
    orchestrator.send({ type: 'buffered2' });
    orchestrator.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(factory.voiceConnection.sentMessages).toContainEqual({ type: 'buffered1' });
    expect(factory.voiceConnection.sentMessages).toContainEqual({ type: 'buffered2' });
    expect((orchestrator as any).messageBuffer).toHaveLength(0);
  });

  it(OrchestratorTestCases.NON_RESPONSE_DONE_IGNORED, async () => {
    factory.accountService.credits = 1000;
    orchestrator.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const creditsBefore = (orchestrator as any).availableCredits;
    orchestrator.onMsgReceived({ type: 'response.audio.delta', delta: 'audio-data' });
    expect((orchestrator as any).availableCredits).toBe(creditsBefore);
  });

  it(OrchestratorTestCases.MISSING_USAGE_HANDLED, async () => {
    factory.accountService.credits = 1000;
    orchestrator.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const creditsBefore = (orchestrator as any).availableCredits;
    orchestrator.onMsgReceived({ type: 'response.done', response: {} });
    expect((orchestrator as any).availableCredits).toBe(creditsBefore);
  });

  it(OrchestratorTestCases.NEGATIVE_CREDITS_DISCONNECT, async () => {
    factory.accountService.credits = 10;
    orchestrator.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(() => {
      orchestrator.onMsgReceived({ type: 'response.done', response: { usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 } } });
    }).toThrow('NO_CREDITS');
    expect(factory.voiceConnection.disconnected).toBe(true);
  });

  it(OrchestratorTestCases.NO_DUPLICATE_CREDITS_CHECK, async () => {
    let callCount = 0;
    factory.accountService.getCredits = () => {
      callCount++;
      return new Promise((resolve) => setTimeout(() => resolve(1000), 50));
    };
    orchestrator.connect();
    (orchestrator as any).checkAndScheduleCreditsCheck();
    (orchestrator as any).checkAndScheduleCreditsCheck();
    (orchestrator as any).checkAndScheduleCreditsCheck();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(callCount).toBe(1);
  });

  it(OrchestratorTestCases.NULL_SESSION_NO_REPLAY, async () => {
    factory.sessionService.sessionData = null;
    orchestrator.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const sessionUpdateMessages = factory.voiceConnection.sentMessages.filter(
      (msg: any) => msg.type === 'session.update'
    );
    expect(sessionUpdateMessages).toHaveLength(0);
  });

  it(OrchestratorTestCases.REPLAY_SESSION_FORMAT, async () => {
    factory.sessionService.sessionData = { sessionId: 'test-session', instructions: 'test', voice: 'alloy' };
    orchestrator.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(factory.voiceConnection.sentMessages).toContainEqual({
      type: 'session.update',
      session: { sessionId: 'test-session', instructions: 'test', voice: 'alloy' }
    });
  });
});
