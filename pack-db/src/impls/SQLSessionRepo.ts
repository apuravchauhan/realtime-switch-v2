import { Kysely, sql } from 'kysely';
import { createHash } from 'crypto';
import { ISessionRepo, SessionRow } from '../interfaces/ISessionRepo';
import { Database } from '../interfaces/entities/Account';

export class SQLSessionRepo implements ISessionRepo {
  constructor(private db: Kysely<Database>) { }

  async loadSessionByKeyAndId(apiKey: string, sessionId: string): Promise<SessionRow[]> {
    const keyHash = this.hashKey(apiKey);
    const now = new Date().toISOString();

    const rows = await sql<SessionRow>`
      SELECT
        a.account_id,
        s.type,
        s.data,
        acc.token_remaining,
        acc.topup_remaining
      FROM api_keys a
      JOIN accounts acc ON acc.id = a.account_id
      LEFT JOIN sessions s ON s.account_id = a.account_id AND s.session_id = ${sessionId}
      WHERE a.key_hash = ${keyHash}
        AND (a.expires_at IS NULL OR a.expires_at > ${now})
    `.execute(this.db);

    return rows.rows;
  }

  async overwriteConversation(accountId: string, sessionId: string, content: string): Promise<void> {
    await sql`
      UPDATE sessions
      SET data = ${content}
      WHERE account_id = ${accountId}
        AND session_id = ${sessionId}
        AND type = 'CONV'
    `.execute(this.db);
  }

  async upsertSession(accountId: string, sessionId: string, sessionData: string): Promise<void> {
    const now = new Date().toISOString();
    await sql`
      INSERT INTO sessions (account_id, session_id, type, data, created_at)
      VALUES (${accountId}, ${sessionId}, 'SESSION', ${sessionData}, ${now})
      ON CONFLICT(account_id, session_id, type)
      DO UPDATE SET data = ${sessionData}
    `.execute(this.db);
  }

  async appendConversation(accountId: string, sessionId: string, conversationData: string): Promise<void> {
    const now = new Date().toISOString();

    await sql`
      INSERT INTO sessions (account_id, session_id, type, data, created_at)
      VALUES (${accountId}, ${sessionId}, 'CONV', ${conversationData}, ${now})
      ON CONFLICT(account_id, session_id, type)
      DO UPDATE SET data = data || ${conversationData}
    `.execute(this.db);
  }

  private hashKey(plainKey: string): string {
    return createHash('sha256').update(plainKey).digest('hex');
  }
}
