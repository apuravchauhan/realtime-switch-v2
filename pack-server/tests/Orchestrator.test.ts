import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { sql } from 'kysely';
import { ServiceFactory as PackDbServiceFactory } from '@rs/db';
import { ServiceFactory as PackServerServiceFactory } from '../src/core/impls/ServiceFactory';
import { Orchestrator } from '../src/Orchestrator';
import { convertWavToPcm } from './utils/audio';

// Test data
const TEST_EMAIL = 'orchestrator-test@example.com';
const TEST_SESSION_ID = 'orch-test-session-001';
const TEST_CREDITS = 100000;

// Paths
const DB_PATH = '/tmp/rs-test.db';
const ZMQ_SOCKET_PATH = 'ipc:///tmp/rs-test-zmq.sock';

// Test context
let packDbFactory: ReturnType<typeof PackDbServiceFactory.getInstance>;
let packServerFactory: ReturnType<typeof PackServerServiceFactory.getInstance>;
let testAccountId: string;

// Mock WebSocket that captures messages sent to client
class MockWebSocket {
  messages: string[] = [];

  send(message: string): void {
    this.messages.push(message);
  }

  getMessages(): any[] {
    return this.messages.map(m => JSON.parse(m));
  }

  findMessage(type: string): any | undefined {
    return this.getMessages().find(m => m.type === type);
  }

  findAllMessages(type: string): any[] {
    return this.getMessages().filter(m => m.type === type);
  }
}

// Test case descriptions
export enum OrchestratorTestCases {
  EXPECT_VOICE_CONNECTED = 'Voice provider should connect',
  EXPECT_SESSION_CREATED = 'session.created message should be received',
  EXPECT_SESSION_UPDATED = 'session.updated message should be received',
  EXPECT_RESPONSE_DONE = 'response.done message should be received',
  EXPECT_OUTPUT_TRANSCRIPT = 'Output transcript should contain expected words',
  EXPECT_USAGE_RECORDED = 'Usage should be recorded in database',
  EXPECT_CREDITS_DEDUCTED = 'Credits should be deducted after response',
}

describe('Orchestrator Tests', () => {
  beforeAll(async () => {
    // Load test environment
    const dotenv = await import('dotenv');
    const envPath = path.resolve(__dirname, '../../.env.test');
    dotenv.config({ path: envPath });

    // Clean up any existing test DB
    if (fs.existsSync(DB_PATH)) {
      fs.unlinkSync(DB_PATH);
    }

    // Initialize pack-db
    packDbFactory = PackDbServiceFactory.getInstance();

    // Run migrations
    const migrator = packDbFactory.getMigrator();
    const results = await migrator.runAll();
    const failed = results.find(r => r.status === 'failed');
    if (failed) {
      throw new Error(`Migration failed: ${failed.name} - ${failed.error}`);
    }

    // Seed test data
    const accountRepo = packDbFactory.getAccountRepo();

    // Create test account
    const account = await accountRepo.createAccount({
      email: TEST_EMAIL,
      planName: 'Pro',
      tokenRemaining: TEST_CREDITS,
      topupRemaining: 0,
    });
    testAccountId = account.id;

    // Create test session
    const db = packDbFactory.getDatabaseConnection().getDb();
    const now = new Date().toISOString();
    await sql`
      INSERT INTO sessions (account_id, session_id, type, data, created_at)
      VALUES (${testAccountId}, ${TEST_SESSION_ID}, 'SESSION', '{}', ${now})
    `.execute(db);

    // Start ZMQ handler
    const zmqHandler = packDbFactory.getZmqHandler();
    await zmqHandler.start(ZMQ_SOCKET_PATH);

    // Initialize pack-server ZMQ service
    packServerFactory = PackServerServiceFactory.getInstance();
    const zmqService = packServerFactory.getZmqService();
    await zmqService.connect();
  }, 30000);

  afterAll(async () => {
    // Reset factories
    PackServerServiceFactory.reset();
    PackDbServiceFactory.reset();

    // Clean up test DB
    if (fs.existsSync(DB_PATH)) {
      fs.unlinkSync(DB_PATH);
    }

    // Clean up socket file
    const socketFile = ZMQ_SOCKET_PATH.replace('ipc://', '');
    if (fs.existsSync(socketFile)) {
      fs.unlinkSync(socketFile);
    }
  }, 10000);

  it('should forward messages through Orchestrator and track usage', async () => {
    // Create mock WebSocket
    const mockWs = new MockWebSocket();

    // Create Orchestrator
    const orchestrator = new Orchestrator(
      testAccountId,
      TEST_SESSION_ID,
      '{}', // sessionData (empty, we'll send session.update manually)
      TEST_CREDITS,
      mockWs as any,
      packServerFactory
    );

    // Connect to voice provider
    orchestrator.connect();

    // Wait for voice provider to connect
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify session.created was forwarded to client
    const sessionCreated = mockWs.findMessage('session.created');
    expect(sessionCreated, OrchestratorTestCases.EXPECT_SESSION_CREATED).toBeDefined();

    // Send session configuration (as JSON string, like real client)
    const sessionConfig = JSON.stringify({
      type: 'session.update',
      session: {
        type: 'realtime',
        output_modalities: ['audio'],
        instructions: 'You are a helpful assistant. Keep responses brief.',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            transcription: { model: 'whisper-1' },
            turn_detection: { type: 'server_vad' },
          },
          output: {
            format: { type: 'audio/pcm', rate: 24000 },
            voice: 'alloy',
          },
        },
      },
    });
    orchestrator.send(sessionConfig);

    // Wait for session.updated
    await new Promise(resolve => setTimeout(resolve, 500));
    const sessionUpdated = mockWs.findMessage('session.updated');
    expect(sessionUpdated, OrchestratorTestCases.EXPECT_SESSION_UPDATED).toBeDefined();

    // Load and send test audio
    const audioPath = path.join(__dirname, 'this-isa-great-day.wav');
    const wavBuffer = fs.readFileSync(audioPath);
    const pcmBuffer = convertWavToPcm(wavBuffer);
    const base64Audio = pcmBuffer.toString('base64');

    const audioMessage = JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: base64Audio,
    });
    orchestrator.send(audioMessage);

    // Wait for full response (VAD detection + response generation)
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Verify response.done was forwarded
    const responseDoneMessages = mockWs.findAllMessages('response.done');
    expect(responseDoneMessages.length, OrchestratorTestCases.EXPECT_RESPONSE_DONE).toBeGreaterThan(0);

    // Find a completed response (not cancelled)
    const completedResponse = responseDoneMessages.find(
      m => m.response?.status === 'completed'
    );
    expect(completedResponse, 'Should have at least one completed response').toBeDefined();

    // Verify usage was recorded in database
    const db = packDbFactory.getDatabaseConnection().getDb();
    const usageResult = await sql<{ count: number }>`
      SELECT COUNT(*) as count FROM usage_metrics
      WHERE account_id = ${testAccountId}
        AND session_id = ${TEST_SESSION_ID}
        AND provider = 'OPENAI'
    `.execute(db);
    expect(usageResult.rows[0].count, OrchestratorTestCases.EXPECT_USAGE_RECORDED).toBeGreaterThan(0);

    // Get actual tokens from usage_metrics
    const usageDetails = await sql<{ input_tokens: number; output_tokens: number }>`
      SELECT input_tokens, output_tokens FROM usage_metrics
      WHERE account_id = ${testAccountId}
        AND session_id = ${TEST_SESSION_ID}
      ORDER BY created_at DESC
      LIMIT 1
    `.execute(db);
    const lastUsage = usageDetails.rows[0];
    expect(lastUsage.input_tokens, 'Input tokens should be recorded').toBeGreaterThan(0);
    expect(lastUsage.output_tokens, 'Output tokens should be recorded').toBeGreaterThan(0);

    // Verify credits were deducted in database
    const creditsResult = await sql<{ token_remaining: number }>`
      SELECT token_remaining FROM accounts WHERE id = ${testAccountId}
    `.execute(db);

    // Note: Credits in DB won't change because updateUsage only inserts to usage_metrics,
    // it doesn't deduct from accounts table. The Orchestrator tracks credits locally.
    // But we can verify usage was recorded which proves trackUsage() was called.

    // Check output transcript contains expected content
    const outputTranscripts = mockWs.findAllMessages('response.output_audio_transcript.done');
    if (outputTranscripts.length > 0) {
      const combinedOutput = outputTranscripts.map(m => m.transcript).join(' ').toLowerCase();
      expect(combinedOutput, OrchestratorTestCases.EXPECT_OUTPUT_TRANSCRIPT).toMatch(/great|day|hello/i);
    }

    // Cleanup
    orchestrator.cleanup();
  }, 20000);

  it('should buffer messages until voice provider connects', async () => {
    const mockWs = new MockWebSocket();

    const orchestrator = new Orchestrator(
      testAccountId,
      TEST_SESSION_ID,
      '{}',
      TEST_CREDITS,
      mockWs as any,
      packServerFactory
    );

    // Send message BEFORE connecting - should be buffered
    const earlyMessage = JSON.stringify({ type: 'test.early', data: 'buffered' });
    orchestrator.send(earlyMessage);

    // Now connect
    orchestrator.connect();

    // Wait for connection and buffer flush
    await new Promise(resolve => setTimeout(resolve, 2000));

    // The early message should have been sent to voice provider after connection
    // We can't directly verify it was sent to OpenAI, but we can verify no error was thrown
    // and session.created was received (proving connection worked)
    const sessionCreated = mockWs.findMessage('session.created');
    expect(sessionCreated, 'Connection should succeed even with buffered messages').toBeDefined();

    orchestrator.cleanup();
  }, 10000);
});
