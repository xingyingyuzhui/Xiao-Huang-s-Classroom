import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { migrateToLatest } from '../src/db/migrate.js';
import { AuditService } from '../src/audit/service.js';
import { CleanupService } from '../src/audit/cleanup.js';
import {
  startPgTestEnv,
  stopPgTestEnv,
  type PgTestEnv,
} from './helpers/pg-test-container.js';

describe('audit & cleanup', () => {
  let pgEnv: PgTestEnv;

  beforeAll(async () => {
    pgEnv = await startPgTestEnv();
    const migration = await migrateToLatest(pgEnv.pool);
    expect(migration.ok).toBe(true);
  }, 120_000);

  afterAll(async () => {
    await stopPgTestEnv(pgEnv);
  });

  describe('AuditService', () => {
    it('records event with sanitized detail', async () => {
      const audit = new AuditService(pgEnv.pool);
      await audit.log({
        accountId: 'acc_1',
        eventType: 'auth.login',
        detail: { browser: 'chrome', ip: '1.2.3.4' },
        ipAddress: '1.2.3.4',
        requestId: 'req_1',
      });

      const { rows } = await pgEnv.pool.query(
        `SELECT * FROM audit_log WHERE request_id = 'req_1'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].event_type).toBe('auth.login');
      expect(rows[0].detail).toEqual({ browser: 'chrome', ip: '1.2.3.4' });
    });

    it('redacts sensitive keys', async () => {
      const audit = new AuditService(pgEnv.pool);
      await audit.log({
        accountId: 'acc_2',
        eventType: 'ai.credential_set',
        detail: { provider: 'openai', apiKey: 'sk-secret-123', token: 'tok' },
        requestId: 'req_2',
      });

      const { rows } = await pgEnv.pool.query(
        `SELECT detail FROM audit_log WHERE request_id = 'req_2'`,
      );
      expect(rows[0].detail.apiKey).toBe('[REDACTED]');
      expect(rows[0].detail.token).toBe('[REDACTED]');
      expect(rows[0].detail.provider).toBe('openai');
    });
  });

  describe('CleanupService', () => {
    it('removes expired trash and is idempotent', async () => {
      // Insert a class with old deleted_at
      await pgEnv.pool.query(
        `INSERT INTO accounts (account_id, display_name) VALUES ('acc_cleanup', 'Test') ON CONFLICT DO NOTHING`,
      );
      await pgEnv.pool.query(
        `INSERT INTO classes (class_id, account_id, name, deleted_at)
         VALUES ('cls_old', 'acc_cleanup', 'Old Class', NOW() - INTERVAL '60 days')`,
      );

      const cleanup = new CleanupService(pgEnv.pool);
      const first = await cleanup.cleanupExpiredTrash();
      expect(first).toBeGreaterThanOrEqual(1);

      const second = await cleanup.cleanupExpiredTrash();
      expect(second).toBe(0);
    });
  });
});
