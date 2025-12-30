export interface Session {
  account_id: string;
  session_id: string;
  type: 'SESSION' | 'CONV';
  data: string;
  created_at: string;
}
