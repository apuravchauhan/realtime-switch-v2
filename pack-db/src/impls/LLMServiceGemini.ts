import { ILLMService, LLMResponse } from '../interfaces/ILLMService';
import { Config, ConfigKeys } from './Config';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent';

export class LLMServiceGemini implements ILLMService {
  private apiKey: string;

  constructor(config: Config) {
    this.apiKey = config.get(ConfigKeys.GEMINI_API_KEY);
  }

  async executePrompt(
    prompt: string,
    maxOutputTokens: number = 6000,
    temperature: number = 0.3
  ): Promise<LLMResponse> {
    try {
      const response = await fetch(`${GEMINI_API_URL}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens,
            temperature,
          },
        }),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Gemini API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as GeminiResponse;
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content) {
        return {
          success: false,
          error: 'No content in Gemini response',
        };
      }

      return {
        success: true,
        content: content.trim(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}
