import type { DbPool } from '../db/pool.js';
import { AccountRepository } from '../db/repositories/account.js';
import { AuditService } from './service.js';
import { AUDIT_EVENTS } from './events.js';

/** Global cleanup — invoke only from admin/scheduler routes, never user APIs. */
export class CleanupService {
  private readonly audit: AuditService;

  constructor(private readonly pool: DbPool) {
    this.audit = new AuditService(pool);
  }

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

  async cleanupExpiredAccounts(): Promise<number> {
    const accounts = new AccountRepository(this.pool);
    const expired = await accounts.listExpiredPendingDeletion();
    let removed = 0;

    for (const account of expired) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE audit_log
           SET account_id = NULL,
               detail = detail || jsonb_build_object('accountPurged', true)
           WHERE account_id = $1`,
          [account.account_id],
        );
        const accountRepo = new AccountRepository(client);
        const deleted = await accountRepo.hardDelete(account.account_id);
        if (!deleted) {
          await client.query('ROLLBACK');
          continue;
        }
        await client.query('COMMIT');
        removed += 1;
        await this.audit.log({
          accountId: null,
          eventType: AUDIT_EVENTS.ACCOUNT_DELETION_COMPLETED,
          detail: { accountPurged: true },
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    return removed;
  }

  async runAll(): Promise<{ trash: number; sessions: number; audit: number; accounts: number }> {
    const trash = await this.cleanupExpiredTrash();
    const sessions = await this.cleanupExpiredSessions();
    const audit = await this.cleanupOldAuditLogs();
    const accounts = await this.cleanupExpiredAccounts();
    return { trash, sessions, audit, accounts };
  }
}
