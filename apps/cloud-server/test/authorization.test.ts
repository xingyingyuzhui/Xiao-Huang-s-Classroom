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

describe('authorization — IDOR protection', () => {
  let pgEnv: PgTestEnv;
  let agent: ReturnType<typeof request>;
  let userAToken: string;
  let userBSessionId: string;

  beforeAll(async () => {
    pgEnv = await startPgTestEnv();
    await migrateToLatest(pgEnv.pool);

    await seedTestAccount(pgEnv.pool, {
      username: 'user_a',
      password: 'password123',
      displayName: 'User A',
    });
    const userB = await seedTestAccount(pgEnv.pool, {
      username: 'user_b',
      password: 'password123',
      displayName: 'User B',
      deviceId: 'dev_user_b',
      deviceLabel: 'User B Device',
    });
    userBSessionId = userB.sessionId;

    const config = loadCloudConfig(testCloudEnv(pgEnv.databaseUrl));
    const app = createCloudApp({ config, pool: pgEnv.pool });
    agent = request.agent(app);

    const loginA = await loginTestAccount(agent, {
      username: 'user_a',
      password: 'password123',
    });
    userAToken = loginA.accessToken;
  }, 120_000);

  afterAll(async () => {
    await stopPgTestEnv(pgEnv);
  });

  it('cannot revoke another account device session', async () => {
    const res = await agent
      .delete(`/api/cloud/v1/devices/${userBSessionId}`)
      .set('Authorization', `Bearer ${userAToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_TENANT');
  });

  it('tenant-check uses JWT principal not client headers', async () => {
    const res = await agent
      .get('/api/cloud/v1/_internal/tenant-check')
      .set('Authorization', `Bearer ${userAToken}`)
      .set('x-account-id', 'attacker-account');
    expect(res.status).toBe(200);
    expect(res.body.data.accountId).not.toBe('attacker-account');
    expect(res.body.data.accountId).toMatch(/^acct_/);
  });

  it('rejects unauthenticated account profile access', async () => {
    const res = await agent.get('/api/cloud/v1/account');
    expect(res.status).toBe(401);
  });
});
