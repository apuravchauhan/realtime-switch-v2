export const SUMMARY_PROMPT_TEMPLATE = `Below is a conversation log between a user and an agent. ` +
  `Condense or summarize the conversation log to fit within {targetChars} characters ` +
  `while preserving important context and details.

Conversation log:
{conversation}

Condensed conversation:`;

export function buildSummaryPrompt(conversation: string, targetChars: number): string {
  return SUMMARY_PROMPT_TEMPLATE
    .replace('{targetChars}', targetChars.toString())
    .replace('{conversation}', conversation);
}

export const SUMMARY_DEFAULTS = {
  THRESHOLD_CHARS: 32000,
  TARGET_CHARS: 24000,
  TEMPERATURE: 0.3,
};
