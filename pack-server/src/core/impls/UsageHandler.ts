import { IAccountService, Logger } from 'pack-shared';
import { IUsageHandler } from '../interfaces/IUsageHandler';

const USAGE_BATCH_SIZE = 5;
const CLASS_NAME = 'UsageHandler';

export class UsageHandler implements IUsageHandler {
  private accountId: string;
  private sessionId: string;
  private accountService: IAccountService;

  private inputTokens: number = 0;
  private outputTokens: number = 0;
  private currentBatchSize: number = 0;

  constructor(accountId: string, sessionId: string, accountService: IAccountService) {
    this.accountId = accountId;
    this.sessionId = sessionId;
    this.accountService = accountService;
  }

  saveUsage(message: string): { inputTokens: number, outputTokens: number } | null {
    // Return early if message doesn't contain "type":"response.done"
    if (message.indexOf('"type":"response.done"') === -1) return null;

    // Extract input tokens
    const inputIdx = message.indexOf('"input_tokens":');
    if (inputIdx === -1) return null;

    let inputStart = inputIdx + 15;
    let inputEnd = inputStart;
    while (message.charCodeAt(inputEnd) >= 48 && message.charCodeAt(inputEnd) <= 57) inputEnd++;
    if (inputEnd === inputStart) return null;
    const inputTokens = parseInt(message.slice(inputStart, inputEnd), 10);

    // Extract output tokens
    const outputIdx = message.indexOf('"output_tokens":', inputEnd);
    if (outputIdx === -1) return null;

    let outputStart = outputIdx + 16;
    let outputEnd = outputStart;
    while (message.charCodeAt(outputEnd) >= 48 && message.charCodeAt(outputEnd) <= 57) outputEnd++;
    if (outputEnd === outputStart) return null;
    const outputTokens = parseInt(message.slice(outputStart, outputEnd), 10);

    // Accumulate tokens
    this.inputTokens += inputTokens;
    this.outputTokens += outputTokens;
    this.currentBatchSize++;

    Logger.debug(CLASS_NAME, this.accountId, `Saved usage: input=${inputTokens}, output=${outputTokens}, batch size=${this.currentBatchSize}`);

    if (this.currentBatchSize >= USAGE_BATCH_SIZE) {
      this.flush();
    }

    return { inputTokens, outputTokens };
  }

  flush(): void {
    if (this.currentBatchSize === 0) {
      Logger.debug(CLASS_NAME, this.accountId, 'No usage data to flush');
      return;
    }

    Logger.debug(CLASS_NAME, this.accountId, `Flushing usage: total input=${this.inputTokens}, total output=${this.outputTokens}, batch count=${this.currentBatchSize}`);
    this.accountService.updateUsage(this.accountId, this.sessionId, 'openai', this.inputTokens, this.outputTokens);

    this.inputTokens = 0;
    this.outputTokens = 0;
    this.currentBatchSize = 0;
  }
}
