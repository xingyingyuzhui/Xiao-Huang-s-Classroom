import type { DbPool } from '../db/pool.js';

export class CleanupService {
  constructor(private readonly pool: DbPool) {}

  async cleanupExpiredTrash(): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM classes WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days'`,
    );
    return result.rowCount ?? 0;
  }

  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM device_sessions WHERE expires_at < NOW() - INTERVAL '7 days'`,
    );
    return result.rowCount ?? 0;
  }

  async cleanupOldAuditLogs(retentionDays: number = 365): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
      [retentionDays],
    );
    return result.rowCount ?? 0;
  }

  async runAll(): Promise<{ trash: number; sessions: number; audit: number }> {
    const trash = await this.cleanupExpiredTrash();
    const sessions = await this.cleanupExpiredSessions();
    const audit = await this.cleanupOldAuditLogs();
    return { trash, sessions, audit };
  }
}
