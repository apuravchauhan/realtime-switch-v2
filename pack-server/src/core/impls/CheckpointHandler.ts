import { IAccountService } from 'pack-shared';
import { ICheckpointHandler } from '../interfaces/ICheckpointHandler';

const CONVERSATION_BUFFER_THRESHOLD = 200;

export class CheckpointHandler implements ICheckpointHandler {
  private accountId: string;
  private sessionId: string;
  private accountService: IAccountService;

  private conversationBuffer: string[] = [];
  private conversationBufferLength: number = 0;
  private currentConvType: 'user' | 'agent' | null = null;

  constructor(accountId: string, sessionId: string, accountService: IAccountService) {
    this.accountId = accountId;
    this.sessionId = sessionId;
    this.accountService = accountService;
  }

  trackConversation(message: string): void {
    let type: 'user' | 'agent' | null = null;
    let delta: string | null = null;

    const userTypeIdx = message.indexOf('"type":"conversation.item.input_audio_transcription.delta"');
    if (userTypeIdx !== -1) {
      type = 'user';
      const deltaIdx = message.indexOf('"delta":"');
      if (deltaIdx !== -1) {
        const start = deltaIdx + 9;
        const end = message.indexOf('"', start);
        if (end !== -1) {
          delta = message.slice(start, end);
        }
      }
    }

    const agentTypeIdx = message.indexOf('"type":"response.output_audio_transcript.delta"');
    if (agentTypeIdx !== -1) {
      type = 'agent';
      const deltaIdx = message.indexOf('"delta":"');
      if (deltaIdx !== -1) {
        const start = deltaIdx + 9;
        const end = message.indexOf('"', start);
        if (end !== -1) {
          delta = message.slice(start, end);
        }
      }
    }

    if (!type || !delta) return;

    if (this.currentConvType !== type) {
      const prefix = this.conversationBuffer.length > 0 ? '\n' : '';
      this.conversationBuffer.push(`${prefix}${type}:${delta}`);
      this.currentConvType = type;
    } else {
      this.conversationBuffer.push(delta);
    }

    this.conversationBufferLength += delta.length;

    if (this.conversationBufferLength >= CONVERSATION_BUFFER_THRESHOLD) {
      this.flush();
    }
  }

  flush(): void {
    if (this.conversationBuffer.length === 0) return;

    const content = this.conversationBuffer.join('');

    // Reset buffer state immediately before async operation
    this.currentConvType = null;
    this.conversationBuffer = [];
    this.conversationBufferLength = 0;

    // Fire-and-forget append after buffer is cleared
    this.accountService.appendConversation(this.accountId, this.sessionId, content);
  }
}
