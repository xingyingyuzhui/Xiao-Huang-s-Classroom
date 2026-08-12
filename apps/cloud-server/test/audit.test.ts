import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createCloudApp } from '../src/app.js';
import { loadCloudConfig } from '../src/config.js';
import { migrateToLatest } from '../src/db/migrate.js';
import { AuditService } from '../src/audit/service.js';
import { CleanupService } from '../src/audit/cleanup.js';
import { ClassService } from '../src/classes/service.js';
import { AUDIT_EVENTS } from '../src/audit/events.js';
import {
  startPgTestEnv,
  stopPgTestEnv,
  testCloudEnv,
  type PgTestEnv,
} from './helpers/pg-test-container.js';
import { loginTestAccount, seedTestAccount } from './helpers/auth-fixtures.js';

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

  describe('admin cleanup authorization', () => {
    it('rejects a normal authenticated user', async () => {
      await seedTestAccount(pgEnv.pool, {
        username: 'audit_cleanup_user',
        password: 'password123',
        displayName: 'Cleanup User',
        deviceId: 'dev_audit_cleanup',
        deviceLabel: 'Cleanup Device',
      });
      const config = loadCloudConfig(testCloudEnv(pgEnv.databaseUrl));
      const app = createCloudApp({ config, pool: pgEnv.pool });
      const agent = request.agent(app);
      const login = await loginTestAccount(agent, {
        username: 'audit_cleanup_user',
        password: 'password123',
        deviceId: 'dev_audit_cleanup',
      });

      const res = await agent
        .post('/api/cloud/v1/admin/cleanup')
        .set('Authorization', `Bearer ${login.accessToken}`);
      expect([403, 404]).toContain(res.status);
    });
  });

  describe('class delete/restore audit', () => {
    it('records metadata-only class delete and restore events', async () => {
      const account = await seedTestAccount(pgEnv.pool, {
        username: 'audit_class_user',
        password: 'password123',
        displayName: 'Audit Class User',
        deviceId: 'dev_audit_class',
        deviceLabel: 'Audit Class Device',
      });
      const classes = new ClassService(pgEnv.pool);
      const created = await classes.createClass(account.accountId, 'Audited class');
      await classes.deleteClass(account.accountId, created.id, { requestId: 'req_class_del' });
      await classes.restoreClass(account.accountId, created.id, { requestId: 'req_class_rst' });

      const deleted = await pgEnv.pool.query(
        `SELECT event_type, detail FROM audit_log WHERE request_id = 'req_class_del'`,
      );
      expect(deleted.rows).toHaveLength(1);
      expect(deleted.rows[0].event_type).toBe(AUDIT_EVENTS.CLASS_DELETE);
      expect(deleted.rows[0].detail).toEqual({ classId: created.id });
      expect(JSON.stringify(deleted.rows[0].detail)).not.toMatch(/password|token|roster/i);

      const restored = await pgEnv.pool.query(
        `SELECT event_type, detail FROM audit_log WHERE request_id = 'req_class_rst'`,
      );
      expect(restored.rows).toHaveLength(1);
      expect(restored.rows[0].event_type).toBe(AUDIT_EVENTS.CLASS_RESTORE);
    });
  });
});

