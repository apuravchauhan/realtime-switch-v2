import { describe, it, expect, beforeAll } from 'vitest';
import { OpenAIConnection } from '../src/OpenAIConnection';
import { FileLoggerHandler } from './FileLoggerHandler';
import { convertWavToPcm } from './utils/audio';
import { OpenAITestCases } from './OpenAITestCases';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load test environment
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

describe('OpenAI Full Response Turn', () => {
  it('should connect to OpenAI API', async () => {
    const tempDir = path.join(__dirname, 'temp');
    const connection = new OpenAIConnection();
    const handler = new FileLoggerHandler(tempDir);

    connection.connect(handler);

    await new Promise(resolve => setTimeout(resolve, 2000));

    expect(connection.isConnected(), OpenAITestCases.EXPECT_CONNECTION_SUCCESS).toBe(true);

    connection.disconnect();
  }, 5000);

  it('should connect, send audio, and capture full response turn', async () => {
    const tempDir = path.join(__dirname, 'temp');

    const connection = new OpenAIConnection();
    const handler = new FileLoggerHandler(tempDir);

    connection.connect(handler);

    await new Promise(resolve => setTimeout(resolve, 2000));

    expect(connection.isConnected(), OpenAITestCases.EXPECT_CONNECTION_SUCCESS).toBe(true);

    const audioPath = path.join(__dirname, 'this-isa-great-day.wav');
    const wavBuffer = fs.readFileSync(audioPath);
    const pcmBuffer = convertWavToPcm(wavBuffer);
    const base64Audio = pcmBuffer.toString('base64');

    connection.send({
      type: 'session.update',
      session: {
        type: 'realtime',
        output_modalities: ['audio'],
        instructions: 'You are a helpful assistant.',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            transcription: {
              model: 'whisper-1'
            },
            turn_detection: {
              type: 'server_vad'
            }
          },
          output: {
            format: { type: 'audio/pcm', rate: 24000 },
            voice: 'alloy'
          }
        }
      }
    });

    connection.send({
      type: 'input_audio_buffer.append',
      audio: base64Audio
    });

    await new Promise(resolve => setTimeout(resolve, 5000));

    connection.disconnect();

    await new Promise(resolve => setTimeout(resolve, 500));

    const logFile = handler.getLogFile();
    expect(fs.existsSync(logFile), OpenAITestCases.EXPECT_LOG_FILE_EXISTS).toBe(true);

    const logContent = fs.readFileSync(logFile, 'utf-8');
    const messages = JSON.parse(logContent);

    const errorMessages = messages.filter((msg: any) => msg.type === 'error');
    expect(errorMessages.length, OpenAITestCases.EXPECT_0_ERRORS_IN_RESPONSE).toBe(0);

    const outputTranscripts = messages.filter((msg: any) => msg.type === 'response.output_audio_transcript.done');
    const combinedOutputTranscript = outputTranscripts.map((msg: any) => msg.transcript).join(' ').toLowerCase();
    expect(combinedOutputTranscript, OpenAITestCases.EXPECT_GREATDAY_IN_OUTPUT_TRANSCRIPT).toContain('great');
    expect(combinedOutputTranscript, OpenAITestCases.EXPECT_GREATDAY_IN_OUTPUT_TRANSCRIPT).toContain('day');

    const inputTranscripts = messages.filter((msg: any) => msg.type === 'conversation.item.input_audio_transcription.completed');
    const combinedInputTranscript = inputTranscripts.map((msg: any) => msg.transcript).join(' ').toLowerCase();
    expect(combinedInputTranscript, OpenAITestCases.EXPECT_GREATDAY_IN_INPUT_TRANSCRIPT).toContain('great');
    expect(combinedInputTranscript, OpenAITestCases.EXPECT_GREATDAY_IN_INPUT_TRANSCRIPT).toContain('day');

  }, 15000);
});
