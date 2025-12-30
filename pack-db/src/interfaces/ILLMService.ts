export interface LLMResponse {
  success: boolean;
  content?: string;
  error?: string;
}

export interface ILLMService {
  executePrompt(prompt: string, maxOutputTokens?: number, temperature?: number): Promise<LLMResponse>;
}
