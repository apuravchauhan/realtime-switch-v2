export interface UsageMetric {
  id?: number;
  account_id: string;
  session_id: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  created_at: string;
}
