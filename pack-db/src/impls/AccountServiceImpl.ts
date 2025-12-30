import { IAccountService, SessionData } from 'pack-shared';
import { ILLMService } from '../interfaces/ILLMService';
import { SQLiteAccountRepo } from './SQLiteAccountRepo';
import { buildSummaryPrompt, SUMMARY_DEFAULTS } from './prompts/SummaryPrompt';

const CONTEXT_PREFIX = '\n\nHere is the previous conversation that happened which should be continued now:\n';

export class AccountServiceImpl implements IAccountService {
  private repo: SQLiteAccountRepo;
  private llmService: ILLMService;

  constructor(repo: SQLiteAccountRepo, llmService: ILLMService) {
    this.repo = repo;
    this.llmService = llmService;
  }

  async validateAndLoad(apiKey: string, sessionId: string): Promise<SessionData> {
    try {
      const rows = await this.repo.loadSessionByKeyAndId(apiKey, sessionId);

      if (rows.length === 0) {
        return { error: 'INVALID_AUTH', accountId: '', sessionData: '', credits: 0 };
      }

      const accountId = rows[0].account_id;
      const totalCredits = rows[0].token_remaining + rows[0].topup_remaining;

      if (totalCredits <= 0) {
        return { error: 'NO_CREDITS', accountId, sessionData: '', credits: totalCredits };
      }

      let sessionData = '';
      let conversation = '';

      for (const row of rows) {
        if (row.type === 'SESSION') {
          sessionData = row.data || '';
        } else if (row.type === 'CONV') {
          conversation = row.data || '';
        }
      }

      if (!sessionData) {
        return { error: '', accountId, sessionData: '', credits: totalCredits };
      }

      if (conversation.length > 0) {
        let contextToInject = conversation;

        if (conversation.length > SUMMARY_DEFAULTS.THRESHOLD_CHARS) {
          // Fire and forget - trigger summarization in background
          this.triggerSummarization(accountId, sessionId, conversation).catch((err) => {
            console.error('[AccountServiceImpl] Summarization failed:', err);
          });
          // Use truncated version immediately for this request
          contextToInject = this.truncateToRecent(conversation, SUMMARY_DEFAULTS.THRESHOLD_CHARS);
        }

        sessionData = this.injectIntoInstructions(sessionData, CONTEXT_PREFIX + contextToInject);
      }

      return { error: '', accountId, sessionData, credits: totalCredits };
    } catch (error) {
      console.error('[AccountServiceImpl] Error in validateAndLoad:', error);
      return { error: 'INTERNAL_ERROR', accountId: '', sessionData: '', credits: 0 };
    }
  }

  private async triggerSummarization(
    accountId: string,
    sessionId: string,
    conversation: string
  ): Promise<void> {
    console.log(
      `[AccountServiceImpl] Starting summarization for ${accountId}:${sessionId} (${conversation.length} chars)`
    );

    const prompt = buildSummaryPrompt(
      conversation,
      SUMMARY_DEFAULTS.TARGET_CHARS
    );

    const maxOutputTokens = Math.floor(SUMMARY_DEFAULTS.TARGET_CHARS / 4);
    const response = await this.llmService.executePrompt(
      prompt,
      maxOutputTokens,
      SUMMARY_DEFAULTS.TEMPERATURE
    );

    if (!response.success || !response.content) {
      throw new Error(response.error || 'No summary content returned');
    }

    const summary = response.content;
    console.log(
      `[AccountServiceImpl] Summarization complete: ${conversation.length} -> ${summary.length} chars`
    );

    // Overwrite the CONV row with the summarized content (async, non-blocking to response flow)
    await this.repo.overwriteConversation(accountId, sessionId, summary);
    console.log(`[AccountServiceImpl] CONV row overwritten for ${accountId}:${sessionId}`);
  }

  private truncateToRecent(content: string, maxChars: number): string {
    if (content.length <= maxChars) {
      return content;
    }
    const truncated = content.slice(-maxChars);
    const firstNewline = truncated.indexOf('\n');
    if (firstNewline > 0) {
      return '[...earlier context omitted...]\n' + truncated.slice(firstNewline + 1);
    }
    return truncated;
  }

  private injectIntoInstructions(sessionData: string, context: string): string {
    const escapedContext = context
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');

    const regex = /("instructions"\s*:\s*")([^"]*(?:\\.[^"]*)*)(")/;
    if (regex.test(sessionData)) {
      return sessionData.replace(regex, `$1$2${escapedContext}$3`);
    }

    if (sessionData.startsWith('{')) {
      return `{"instructions":"${escapedContext}",` + sessionData.slice(1);
    }

    return sessionData;
  }

  updateUsage(accountId: string, sessionId: string, provider: string, inputTokens: number, outputTokens: number): void {
    this.repo.insertUsage(accountId, sessionId, provider, inputTokens, outputTokens).catch((err) => {
      console.error('[AccountServiceImpl] Failed to insert usage:', err);
    });
  }

  async getCredits(accountId: string): Promise<number> {
    const credits = await this.repo.getCredits(accountId);
    if (!credits) {
      return 0;
    }
    return credits.tokenRemaining + credits.topupRemaining;
  }
}
