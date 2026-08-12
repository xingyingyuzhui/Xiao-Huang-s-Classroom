import { randomUUID } from 'node:crypto';
import type { DbQueryable } from './account.js';

/** Absolute refresh-session lifetime. Rotation must not extend past this window. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const SESSION_COLUMNS = `session_id, account_id, device_id, label, refresh_token_hash, replaced_refresh_token_hash,
              token_family_id, status, last_seen_at, created_at, revoked_at, expires_at, last_rotated_at`;

export type SessionRow = {
  session_id: string;
  account_id: string;
  device_id: string;
  label: string;
  refresh_token_hash: string;
  replaced_refresh_token_hash: string | null;
  token_family_id: string;
  status: 'active' | 'revoked';
  last_seen_at: Date;
  created_at: Date;
  revoked_at: Date | null;
  expires_at: Date;
  last_rotated_at: Date | null;
};

export function newSessionId(): string {
  return `sess_${randomUUID().replace(/-/g, '')}`;
}

export function newTokenFamilyId(): string {
  return `fam_${randomUUID().replace(/-/g, '')}`;
}

export function sessionExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + SESSION_TTL_MS);
}

export function isSessionActiveAndUnexpired(row: SessionRow, now = new Date()): boolean {
  return row.status === 'active' && row.expires_at.getTime() > now.getTime();
}

export class SessionRepository {
  constructor(private readonly db: DbQueryable) {}

  async findById(sessionId: string): Promise<SessionRow | null> {
    const result = await this.db.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS}
       FROM device_sessions WHERE session_id = $1`,
      [sessionId],
    );
    return result.rows[0] ?? null;
  }

  async findByRefreshHash(refreshHash: string): Promise<SessionRow | null> {
    const result = await this.db.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS}
       FROM device_sessions
       WHERE refresh_token_hash = $1 AND status = 'active'`,
      [refreshHash],
    );
    return result.rows[0] ?? null;
  }

  async findByReplacedRefreshHash(refreshHash: string): Promise<SessionRow | null> {
    const result = await this.db.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS}
       FROM device_sessions
       WHERE replaced_refresh_token_hash = $1`,
      [refreshHash],
    );
    return result.rows[0] ?? null;
  }

  async createSession(input: {
    accountId: string;
    deviceId: string;
    label: string;
    refreshTokenHash: string;
    tokenFamilyId: string;
    expiresAt?: Date;
  }): Promise<SessionRow> {
    const sessionId = newSessionId();
    const expiresAt = input.expiresAt ?? sessionExpiresAt();
    const result = await this.db.query<SessionRow>(
      `INSERT INTO device_sessions
         (session_id, account_id, device_id, label, refresh_token_hash, token_family_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${SESSION_COLUMNS}`,
      [
        sessionId,
        input.accountId,
        input.deviceId,
        input.label,
        input.refreshTokenHash,
        input.tokenFamilyId,
        expiresAt,
      ],
    );
    return result.rows[0]!;
  }

  /**
   * Rotate refresh hash in place. Does NOT extend expires_at (absolute expiry).
   */
  async rotateRefreshToken(
    sessionId: string,
    previousHash: string,
    newHash: string,
  ): Promise<SessionRow | null> {
    const result = await this.db.query<SessionRow>(
      `UPDATE device_sessions
       SET replaced_refresh_token_hash = $2,
           refresh_token_hash = $3,
           last_seen_at = NOW(),
           last_rotated_at = NOW()
       WHERE session_id = $1
         AND status = 'active'
         AND refresh_token_hash = $2
         AND expires_at > NOW()
       RETURNING ${SESSION_COLUMNS}`,
      [sessionId, previousHash, newHash],
    );
    return result.rows[0] ?? null;
  }

  async revokeFamily(tokenFamilyId: string): Promise<number> {
    const result = await this.db.query(
      `UPDATE device_sessions
       SET status = 'revoked', revoked_at = NOW()
       WHERE token_family_id = $1 AND status = 'active'`,
      [tokenFamilyId],
    );
    return result.rowCount ?? 0;
  }

  async revokeSession(sessionId: string, accountId: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE device_sessions
       SET status = 'revoked', revoked_at = NOW()
       WHERE session_id = $1 AND account_id = $2 AND status = 'active'`,
      [sessionId, accountId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async revokeAllForAccount(accountId: string): Promise<number> {
    const result = await this.db.query(
      `UPDATE device_sessions
       SET status = 'revoked', revoked_at = NOW()
       WHERE account_id = $1 AND status = 'active'`,
      [accountId],
    );
    return result.rowCount ?? 0;
  }

  async revokeActiveForAccountDevice(accountId: string, deviceId: string): Promise<number> {
    const result = await this.db.query(
      `UPDATE device_sessions
       SET status = 'revoked', revoked_at = NOW()
       WHERE account_id = $1 AND device_id = $2 AND status = 'active'`,
      [accountId, deviceId],
    );
    return result.rowCount ?? 0;
  }

  /**
   * Revoke active sessions past absolute expires_at.
   * Admin DELETE of stale rows (not a user route):
   *   DELETE FROM device_sessions WHERE expires_at < NOW() - INTERVAL '7 days'
   */
  async revokeExpiredActive(): Promise<number> {
    const result = await this.db.query(
      `UPDATE device_sessions
       SET status = 'revoked', revoked_at = NOW()
       WHERE status = 'active' AND expires_at <= NOW()`,
    );
    return result.rowCount ?? 0;
  }

  async listActiveForAccount(accountId: string): Promise<SessionRow[]> {
    const result = await this.db.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS}
       FROM device_sessions
       WHERE account_id = $1 AND status = 'active' AND expires_at > NOW()
       ORDER BY last_seen_at DESC`,
      [accountId],
    );
    return result.rows;
  }

  async countActiveForAccountDevice(accountId: string, deviceId: string): Promise<number> {
    const result = await this.db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n
       FROM device_sessions
       WHERE account_id = $1 AND device_id = $2 AND status = 'active' AND expires_at > NOW()`,
      [accountId, deviceId],
    );
    return Number(result.rows[0]?.n ?? 0);
  }

  async touch(sessionId: string): Promise<void> {
    await this.db.query(
      `UPDATE device_sessions SET last_seen_at = NOW() WHERE session_id = $1`,
      [sessionId],
    );
  }
}
