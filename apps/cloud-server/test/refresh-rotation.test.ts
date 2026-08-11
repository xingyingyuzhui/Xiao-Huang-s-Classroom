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

describe('refresh token rotation', () => {
  let pgEnv: PgTestEnv;
  let agent: ReturnType<typeof request>;

  beforeAll(async () => {
    pgEnv = await startPgTestEnv();
    await migrateToLatest(pgEnv.pool);
    await seedTestAccount(pgEnv.pool, {
      username: 'rot_user',
      password: 'password123',
      displayName: 'Rotation User',
    });
    const config = loadCloudConfig(testCloudEnv(pgEnv.databaseUrl));
    const app = createCloudApp({ config, pool: pgEnv.pool });
    agent = request.agent(app);
  }, 120_000);

  afterAll(async () => {
    await stopPgTestEnv(pgEnv);
  });

  it('rotates refresh token and revokes family on reuse', async () => {
    const login = await loginTestAccount(agent, {
      username: 'rot_user',
      password: 'password123',
    });

    const firstRefresh = await agent
      .post('/api/cloud/v1/auth/refresh')
      .set('Origin', 'https://cloud.test.local')
      .set('Cookie', `xh_refresh=${login.refreshCookie}`)
      .send({ deviceId: login.deviceId });

    expect(firstRefresh.status).toBe(200);
    expect(firstRefresh.body.data.accessToken).toBeTruthy();

    const oldReuse = await agent
      .post('/api/cloud/v1/auth/refresh')
      .set('Origin', 'https://cloud.test.local')
      .set('Cookie', `xh_refresh=${login.refreshCookie}`)
      .send({ deviceId: login.deviceId });

    expect(oldReuse.status).toBe(401);
    expect(oldReuse.body.error.code).toBe('AUTH_REFRESH_REUSE');
  });
});
