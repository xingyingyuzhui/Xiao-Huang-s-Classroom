import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createCloudApp } from '../src/app.js';
import { loadCloudConfig } from '../src/config.js';
import { migrateToLatest } from '../src/db/migrate.js';
import {
  startPgTestEnv,
  stopPgTestEnv,
  testCloudEnv,
  type PgTestEnv,
} from './helpers/pg-test-container.js';
import { loginTestAccount, seedTestAccount } from './helpers/auth-fixtures.js';
import { SessionRepository } from '../src/db/repositories/session.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { sanitizeRequestId } from '../src/middleware/request-id.js';
import type { Request, Response } from 'express';

const ORIGIN = 'https://cloud.test.local';

describe('auth session expiry, replace, logout', () => {
  let pgEnv: PgTestEnv;
  let agent: ReturnType<typeof request>;

  beforeAll(async () => {
    pgEnv = await startPgTestEnv();
    const migration = await migrateToLatest(pgEnv.pool);
    expect(migration.ok).toBe(true);
    await seedTestAccount(pgEnv.pool, {
      username: 'sess_user',
      password: 'password123',
      displayName: 'Session User',
      deviceId: 'dev_seed_sess',
    });
    const config = loadCloudConfig(testCloudEnv(pgEnv.databaseUrl));
    const app = createCloudApp({ config, pool: pgEnv.pool });
    agent = request.agent(app);
  }, 120_000);

  afterAll(async () => {
    await stopPgTestEnv(pgEnv);
  });

  it('rejects refresh when expires_at is in the past', async () => {
    const login = await loginTestAccount(agent, {
      username: 'sess_user',
      password: 'password123',
      deviceId: 'dev_expire_refresh',
      deviceLabel: 'Web',
    });

    await pgEnv.pool.query(
      `UPDATE device_sessions SET expires_at = NOW() - INTERVAL '1 hour' WHERE session_id = $1`,
      [login.sessionId],
    );

    const refresh = await agent
      .post('/api/cloud/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', `xh_refresh=${login.refreshCookie}`)
      .send({ deviceId: login.deviceId });

    expect(refresh.status).toBe(401);
    expect(refresh.body.error.code).toBe('AUTH_SESSION_EXPIRED');
  });

  it('rejects access token after session expiry even if JWT is unexpired', async () => {
    const login = await loginTestAccount(agent, {
      username: 'sess_user',
      password: 'password123',
      deviceId: 'dev_expire_access',
      deviceLabel: 'Web',
    });

    const before = await agent
      .get('/api/cloud/v1/account')
      .set('Authorization', `Bearer ${login.accessToken}`);
    expect(before.status).toBe(200);

    await pgEnv.pool.query(
      `UPDATE device_sessions SET expires_at = NOW() - INTERVAL '1 hour' WHERE session_id = $1`,
      [login.sessionId],
    );

    const after = await agent
      .get('/api/cloud/v1/account')
      .set('Authorization', `Bearer ${login.accessToken}`);
    expect(after.status).toBe(401);
  });

  it('same device re-login replaces the active session instead of creating unbounded rows', async () => {
    const first = await loginTestAccount(agent, {
      username: 'sess_user',
      password: 'password123',
      deviceId: 'dev_stable_same',
      deviceLabel: 'Web',
    });
    const second = await loginTestAccount(agent, {
      username: 'sess_user',
      password: 'password123',
      deviceId: 'dev_stable_same',
      deviceLabel: 'Web',
    });

    expect(second.sessionId).not.toBe(first.sessionId);

    const sessions = new SessionRepository(pgEnv.pool);
    const accountId = (
      await pgEnv.pool.query<{ account_id: string }>(
        `SELECT account_id FROM device_sessions WHERE session_id = $1`,
        [second.sessionId],
      )
    ).rows[0]!.account_id;
    const active = await sessions.countActiveForAccountDevice(accountId, 'dev_stable_same');
    expect(active).toBe(1);

    const oldRefresh = await agent
      .post('/api/cloud/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', `xh_refresh=${first.refreshCookie}`)
      .send({ deviceId: 'dev_stable_same' });
    expect(oldRefresh.status).toBe(401);
  });

  it('logout invalidates the refresh cookie', async () => {
    const login = await loginTestAccount(agent, {
      username: 'sess_user',
      password: 'password123',
      deviceId: 'dev_logout_one',
      deviceLabel: 'Web',
    });

    const logout = await agent
      .post('/api/cloud/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${login.accessToken}`)
      .set('Cookie', `xh_refresh=${login.refreshCookie}`)
      .send({ deviceId: login.deviceId });
    expect(logout.status).toBe(200);

    const refresh = await agent
      .post('/api/cloud/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', `xh_refresh=${login.refreshCookie}`)
      .send({ deviceId: login.deviceId });
    expect(refresh.status).toBe(401);

    const profile = await agent
      .get('/api/cloud/v1/account')
      .set('Authorization', `Bearer ${login.accessToken}`);
    expect(profile.status).toBe(401);
  });

  it('rotation does not extend absolute expires_at', async () => {
    const login = await loginTestAccount(agent, {
      username: 'sess_user',
      password: 'password123',
      deviceId: 'dev_no_slide',
      deviceLabel: 'Web',
    });

    const before = await pgEnv.pool.query<{ expires_at: Date }>(
      `SELECT expires_at FROM device_sessions WHERE session_id = $1`,
      [login.sessionId],
    );
    const originalExpiry = new Date(before.rows[0]!.expires_at).getTime();

    const refresh = await agent
      .post('/api/cloud/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', `xh_refresh=${login.refreshCookie}`)
      .send({ deviceId: login.deviceId });
    expect(refresh.status).toBe(200);

    const after = await pgEnv.pool.query<{ expires_at: Date; last_rotated_at: Date | null }>(
      `SELECT expires_at, last_rotated_at FROM device_sessions WHERE session_id = $1`,
      [login.sessionId],
    );
    expect(new Date(after.rows[0]!.expires_at).getTime()).toBe(originalExpiry);
    expect(after.rows[0]!.last_rotated_at).toBeTruthy();
  });

  it('sanitizes unsafe X-Request-Id values', async () => {
    const res = await agent.get('/livez').set('X-Request-Id', '../../etc/passwd');
    expect(res.status).toBe(200);
    const echoed = String(res.headers['x-request-id'] ?? '');
    expect(echoed).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(echoed).not.toContain('/');
    expect(echoed).not.toContain('..');
  });
});

describe('invite registration is rejected without an invite store', () => {
  let pgEnv: PgTestEnv;
  let agent: ReturnType<typeof request>;

  beforeAll(async () => {
    pgEnv = await startPgTestEnv();
    await migrateToLatest(pgEnv.pool);
    const env = testCloudEnv(pgEnv.databaseUrl);
    env.CLOUD_REGISTRATION_MODE = 'invite';
    const config = loadCloudConfig(env);
    const app = createCloudApp({ config, pool: pgEnv.pool });
    agent = request.agent(app);
  }, 120_000);

  afterAll(async () => {
    await stopPgTestEnv(pgEnv);
  });

  it('rejects nonempty invite codes when no hashed invite store exists', async () => {
    const res = await agent.post('/api/cloud/v1/auth/register').send({
      username: 'invite_user',
      password: 'password123',
      displayName: 'Invite User',
      inviteCode: 'ANY-NONEMPTY-CODE',
      deviceLabel: 'Web',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_FEATURE_DISABLED');
  });
});

describe('error handler production leak guard', () => {
  it('does not return SQL or paths for unknown errors in production', () => {
    const config = loadCloudConfig({
      ...testCloudEnv('postgresql://user:secret-db-url@localhost:5432/cloud'),
      NODE_ENV: 'production',
    });
    const handler = errorHandler(config);
    const req = { requestId: 'req_prod' } as Request;
    let status = 0;
    let body: { error?: { message?: string } } = {};
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json(payload: { error?: { message?: string } }) {
        body = payload;
        return this;
      },
    } as unknown as Response;

    handler(
      new Error('relation "device_sessions" does not exist at /var/app/src/db/repositories/session.ts'),
      req,
      res,
      () => undefined,
    );

    expect(status).toBe(500);
    expect(body.error?.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toMatch(/device_sessions/);
    expect(JSON.stringify(body)).not.toMatch(/\/var\/app/);
  });
});

describe('request id sanitizer', () => {
  it('accepts safe ids and rejects paths', () => {
    expect(sanitizeRequestId('abc-123_XYZ')).toBe('abc-123_XYZ');
    expect(sanitizeRequestId('../../etc/passwd')).not.toContain('/');
    expect(sanitizeRequestId('id with spaces')).not.toMatch(/\s/);
    expect(sanitizeRequestId('x'.repeat(200)).length).toBeLessThanOrEqual(128);
  });
});
