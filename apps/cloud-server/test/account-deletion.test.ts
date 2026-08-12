import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createCloudApp } from '../src/app.js';
import { loadCloudConfig } from '../src/config.js';
import { migrateToLatest } from '../src/db/migrate.js';
import { CleanupService } from '../src/audit/cleanup.js';
import {
  startPgTestEnv,
  stopPgTestEnv,
  testCloudEnv,
  type PgTestEnv,
} from './helpers/pg-test-container.js';
import { loginTestAccount, seedTestAccount } from './helpers/auth-fixtures.js';

describe('account deletion lifecycle', () => {
  let pgEnv: PgTestEnv;
  let agent: ReturnType<typeof request>;
  let token: string;
  let accountId: string;
  const displayName = 'Delete Me';

  beforeAll(async () => {
    pgEnv = await startPgTestEnv();
    const migration = await migrateToLatest(pgEnv.pool);
    expect(migration.ok).toBe(true);

    const seeded = await seedTestAccount(pgEnv.pool, {
      username: 'delete_user',
      password: 'password123',
      displayName,
      deviceId: 'dev_delete_user',
      deviceLabel: 'Delete Device',
    });
    accountId = seeded.accountId;

    const config = loadCloudConfig(testCloudEnv(pgEnv.databaseUrl));
    const app = createCloudApp({ config, pool: pgEnv.pool });
    agent = request.agent(app);

    const login = await loginTestAccount(agent, {
      username: 'delete_user',
      password: 'password123',
      deviceId: 'dev_delete_user',
    });
    token = login.accessToken;
  }, 120_000);

  afterAll(async () => {
    await stopPgTestEnv(pgEnv);
  });

  it('rejects deletion with wrong password', async () => {
    const res = await agent
      .post('/api/cloud/v1/account/deletion-request')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmDisplayName: displayName, currentPassword: 'wrong-pass' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('rejects deletion with wrong display name', async () => {
    const res = await agent
      .post('/api/cloud/v1/account/deletion-request')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmDisplayName: 'Not Me', currentPassword: 'password123' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.error.code).toBe('VALIDATION_SCHEMA');
  });

  it('requests deletion, revokes sessions, and issues restore-only login', async () => {
    const fresh = await loginTestAccount(agent, {
      username: 'delete_user',
      password: 'password123',
      deviceId: 'dev_delete_flow',
    });
    const profile = await agent
      .get('/api/cloud/v1/account')
      .set('Authorization', `Bearer ${fresh.accessToken}`);
    expect(profile.body.data.accountId).toBe(accountId);

    const res = await agent
      .post('/api/cloud/v1/account/deletion-request')
      .set('Authorization', `Bearer ${fresh.accessToken}`)
      .send({ confirmDisplayName: displayName, currentPassword: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.data.pendingDeletionAt).toBeTruthy();

    const syncAttempt = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId: 'ws-x', operations: [] });
    expect(syncAttempt.status).toBeGreaterThanOrEqual(400);

    const restoreLogin = await loginTestAccount(agent, {
      username: 'delete_user',
      password: 'password123',
      deviceId: 'dev_delete_restore',
    });
    expect(restoreLogin.accessToken).toBeTruthy();

    const restoreProfile = await agent
      .get('/api/cloud/v1/account')
      .set('Authorization', `Bearer ${restoreLogin.accessToken}`);
    expect(restoreProfile.status).toBe(200);
    expect(restoreProfile.body.data.status).toBe('pending_deletion');

    const classAttempt = await agent
      .get('/api/cloud/v1/classes')
      .set('Authorization', `Bearer ${restoreLogin.accessToken}`);
    expect(classAttempt.status).toBeGreaterThanOrEqual(400);
  });

  it('restores account within retention window', async () => {
    const login = await loginTestAccount(agent, {
      username: 'delete_user',
      password: 'password123',
      deviceId: 'dev_delete_restore2',
    });
    const cancel = await agent
      .delete('/api/cloud/v1/account/deletion-request')
      .set('Authorization', `Bearer ${login.accessToken}`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.restored).toBe(true);

    const fullLogin = await loginTestAccount(agent, {
      username: 'delete_user',
      password: 'password123',
      deviceId: 'dev_delete_full',
    });
    const classes = await agent
      .get('/api/cloud/v1/classes')
      .set('Authorization', `Bearer ${fullLogin.accessToken}`);
    expect(classes.status).toBe(200);
  });

  it('does not purge before pending_deletion_at', async () => {
    await agent
      .post('/api/cloud/v1/account/deletion-request')
      .set('Authorization', `Bearer ${(await loginTestAccount(agent, {
        username: 'delete_user',
        password: 'password123',
        deviceId: 'dev_delete_purge_gate',
      })).accessToken}`)
      .send({ confirmDisplayName: displayName, currentPassword: 'password123' });

    const cleanup = new CleanupService(pgEnv.pool);
    const removed = await cleanup.cleanupExpiredAccounts();
    expect(removed).toBe(0);

    const row = await pgEnv.pool.query(`SELECT account_id FROM accounts WHERE account_id = $1`, [
      accountId,
    ]);
    expect(row.rows).toHaveLength(1);
  });

  it('purges expired pending deletion accounts and anonymizes audit rows', async () => {
    await pgEnv.pool.query(
      `UPDATE accounts
       SET status = 'pending_deletion', pending_deletion_at = NOW() - INTERVAL '1 day'
       WHERE account_id = $1`,
      [accountId],
    );
    await pgEnv.pool.query(
      `INSERT INTO audit_log (account_id, event_type, detail, request_id)
       VALUES ($1, 'account.deletion_requested', '{}', 'req_purge_test')`,
      [accountId],
    );

    const cleanup = new CleanupService(pgEnv.pool);
    const first = await cleanup.cleanupExpiredAccounts();
    expect(first).toBe(1);
    const second = await cleanup.cleanupExpiredAccounts();
    expect(second).toBe(0);

    const accountRow = await pgEnv.pool.query(`SELECT account_id FROM accounts WHERE account_id = $1`, [
      accountId,
    ]);
    expect(accountRow.rows).toHaveLength(0);

    const auditRow = await pgEnv.pool.query(
      `SELECT account_id, detail FROM audit_log WHERE request_id = 'req_purge_test'`,
    );
    expect(auditRow.rows[0].account_id).toBeNull();
    expect(auditRow.rows[0].detail.accountPurged).toBe(true);
  });
});
