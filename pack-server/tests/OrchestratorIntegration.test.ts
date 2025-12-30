import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { sql } from 'kysely';
import { ServiceFactory as PackDbServiceFactory } from '@rs/db';
import { ServiceFactory as PackServerServiceFactory } from '../src/core/impls/ServiceFactory';
import { OpenAIConnection } from '../src/OpenAIConnection';
import { FileLoggerHandler } from './FileLoggerHandler';
import { convertWavToPcm } from './utils/audio';

// Test data
const TEST_EMAIL = 'integration-test@example.com';
const TEST_SESSION_ID = 'test-session-001';
const TEST_CREDITS = 100000;

// Paths
const DB_PATH = '/tmp/rs-test.db';
const ZMQ_SOCKET_PATH = 'ipc:///tmp/rs-test-zmq.sock';

// Test context
let packDbFactory: typeof PackDbServiceFactory.prototype & ReturnType<typeof PackDbServiceFactory.getInstance>;
let packServerFactory: ReturnType<typeof PackServerServiceFactory.getInstance>;
let testAccountId: string;
let testApiKey: string;

describe('Orchestrator Integration Tests', () => {
  beforeAll(async () => {
    // Manually load .env.test before any service initialization
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
    console.log('[Test Setup] Migrations completed');

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
    console.log('[Test Setup] Created test account:', testAccountId);

    // Create API key
    const keyResult = await accountRepo.createApiKey({
      accountId: testAccountId,
      label: 'Integration Test Key',
    });
    testApiKey = keyResult.plainKey;
    console.log('[Test Setup] Created test API key:', keyResult.apiKey.key_indicator);

    // Create test session
    const db = packDbFactory.getDatabaseConnection().getDb();
    const now = new Date().toISOString();
    await sql`
      INSERT INTO sessions (account_id, session_id, type, data, created_at)
      VALUES (${testAccountId}, ${TEST_SESSION_ID}, 'SESSION', '{}', ${now})
    `.execute(db);
    console.log('[Test Setup] Created test session:', TEST_SESSION_ID);

    // Start ZMQ handler
    const zmqHandler = packDbFactory.getZmqHandler();
    await zmqHandler.start(ZMQ_SOCKET_PATH);
    console.log('[Test Setup] ZMQ handler started');

    // Initialize pack-server ZMQ service
    packServerFactory = PackServerServiceFactory.getInstance();
    const zmqService = packServerFactory.getZmqService();
    await zmqService.connect();
    console.log('[Test Setup] ZMQ service connected');
  }, 30000);

  afterAll(async () => {
    // Reset factories (stops ZMQ handler and destroys DB connection)
    PackServerServiceFactory.reset();
    PackDbServiceFactory.reset();

    // Clean up test DB
    if (fs.existsSync(DB_PATH)) {
      fs.unlinkSync(DB_PATH);
      console.log('[Test Cleanup] Deleted test DB');
    }

    // Clean up socket file if it exists
    const socketFile = ZMQ_SOCKET_PATH.replace('ipc://', '');
    if (fs.existsSync(socketFile)) {
      fs.unlinkSync(socketFile);
      console.log('[Test Cleanup] Deleted socket file');
    }

    console.log('[Test Cleanup] Complete');
  }, 10000);

  it('validateAndLoad returns valid session with credits', async () => {
    const accountService = packServerFactory.getAccountService();
    const result = await accountService.validateAndLoad(testApiKey, TEST_SESSION_ID);

    expect(result.error).toBe('');
    expect(result.accountId).toBe(testAccountId);
    expect(result.credits).toBe(TEST_CREDITS);
    expect(result.sessionData).toBe('{}');
  });

  it('getCredits returns correct credit balance', async () => {
    const accountService = packServerFactory.getAccountService();
    const credits = await accountService.getCredits(testAccountId);

    expect(credits).toBe(TEST_CREDITS);
  });

  it('updateUsage inserts record in usage_metrics', async () => {
    const accountService = packServerFactory.getAccountService();

    // Fire and forget - no response
    accountService.updateUsage(testAccountId, TEST_SESSION_ID, 'OPENAI', 100, 200);

    // Wait for fire-and-forget to process
    await new Promise(resolve => setTimeout(resolve, 500));

    // Query usage_metrics directly
    const db = packDbFactory.getDatabaseConnection().getDb();
    const result = await sql<{ count: number }>`
      SELECT COUNT(*) as count FROM usage_metrics
      WHERE account_id = ${testAccountId}
        AND session_id = ${TEST_SESSION_ID}
        AND provider = 'OPENAI'
    `.execute(db);

    expect(result.rows[0].count).toBeGreaterThanOrEqual(1);
  });

  it('should connect to OpenAI and complete full audio response', async () => {
    const tempDir = path.join(__dirname, 'temp');
    const connection = new OpenAIConnection();
    const handler = new FileLoggerHandler(tempDir);

    connection.connect(handler);

    await new Promise(resolve => setTimeout(resolve, 2000));
    expect(connection.isConnected(), 'Connection should succeed').toBe(true);

    // Load test audio
    const audioPath = path.join(__dirname, 'this-isa-great-day.wav');
    const wavBuffer = fs.readFileSync(audioPath);
    const pcmBuffer = convertWavToPcm(wavBuffer);
    const base64Audio = pcmBuffer.toString('base64');

    // Send session configuration
    connection.send({
      type: 'session.update',
      session: {
        type: 'realtime',
        output_modalities: ['audio'],
        instructions: 'You are a helpful assistant.',
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

    // Send audio
    connection.send({
      type: 'input_audio_buffer.append',
      audio: base64Audio,
    });

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 5000));

    connection.disconnect();
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify log file
    const logFile = handler.getLogFile();
    expect(fs.existsSync(logFile), 'Log file should exist').toBe(true);

    const logContent = fs.readFileSync(logFile, 'utf-8');
    const messages = JSON.parse(logContent);

    // No errors
    const errorMessages = messages.filter((msg: any) => msg.type === 'error');
    expect(errorMessages.length, 'No error messages').toBe(0);

    // Verify response.done exists (would trigger usage tracking in Orchestrator)
    const responseDone = messages.find((msg: any) => msg.type === 'response.done');
    expect(responseDone, 'response.done message should exist').toBeDefined();

    // Check for output transcript containing expected content
    const outputTranscripts = messages.filter((msg: any) => msg.type === 'response.output_audio_transcript.done');
    const combinedOutput = outputTranscripts.map((msg: any) => msg.transcript).join(' ').toLowerCase();
    expect(combinedOutput, 'Output should contain "great" or "day"').toMatch(/great|day/);
  }, 15000);
});
