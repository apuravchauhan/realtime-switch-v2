import { IConnectionHandler } from '../src/core/interfaces/IConnectionHandler';
import fs from 'fs';
import path from 'path';

export class FileLoggerHandler implements IConnectionHandler {
  private logFile: string;
  private messages: any[] = [];

  constructor(logDir: string) {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';
    const hour12 = hours % 12 || 12;
    const timeStr = `${hour12}-${minutes.toString().padStart(2, '0')}${ampm}`;
    const randomBits = Math.random().toString(36).substring(2, 6);

    this.logFile = path.join(logDir, `test-run-${dateStr}-${timeStr}-${randomBits}.json`);
  }

  onConnect(): void {
    console.log('[FileLoggerHandler] Connected');
  }

  onError(error: Error): void {
    console.log('[FileLoggerHandler] Error:', error.message);
  }

  onClose(code: number, reason: string): void {
    console.log(`[FileLoggerHandler] Closed - code: ${code}, reason: ${reason}, messages: ${this.messages.length}`);
    fs.writeFileSync(this.logFile, JSON.stringify(this.messages, null, 2));
  }

  onMsgReceived(message: unknown): void {
    console.log('[FileLoggerHandler] Message:', JSON.stringify(message).substring(0, 200));
    
    const parsed = typeof message === 'string' ? JSON.parse(message) : message;
    this.messages.push(parsed);
  }

  onLatencyCheck(latencyMs: number): void {
    console.log('[FileLoggerHandler] Latency:', latencyMs);
  }

  getLogFile(): string {
    return this.logFile;
  }
}
