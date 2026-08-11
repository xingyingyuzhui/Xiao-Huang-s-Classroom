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

describe('device sessions', () => {
  let pgEnv: PgTestEnv;
  let agent: ReturnType<typeof request>;
  let accessToken: string;
  let otherSessionId: string;

  beforeAll(async () => {
    pgEnv = await startPgTestEnv();
    await migrateToLatest(pgEnv.pool);
    await seedTestAccount(pgEnv.pool, {
      username: 'device_user',
      password: 'password123',
      displayName: 'Device User',
    });
    const config = loadCloudConfig(testCloudEnv(pgEnv.databaseUrl));
    const app = createCloudApp({ config, pool: pgEnv.pool });
    agent = request.agent(app);

    const primary = await loginTestAccount(agent, {
      username: 'device_user',
      password: 'password123',
      deviceLabel: 'Primary',
    });
    accessToken = primary.accessToken;

    const secondary = await loginTestAccount(agent, {
      username: 'device_user',
      password: 'password123',
      deviceLabel: 'Secondary',
    });
    otherSessionId = secondary.sessionId;
  }, 120_000);

  afterAll(async () => {
    await stopPgTestEnv(pgEnv);
  });

  it('lists active device sessions for the account', async () => {
    const res = await agent
      .get('/api/cloud/v1/devices')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.some((d: { current: boolean }) => d.current)).toBe(true);
  });

  it('revokes another device session', async () => {
    const res = await agent
      .delete(`/api/cloud/v1/devices/${otherSessionId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.revoked).toBe(true);

    const list = await agent
      .get('/api/cloud/v1/devices')
      .set('Authorization', `Bearer ${accessToken}`);
    const revoked = list.body.data.find(
      (d: { sessionId: string }) => d.sessionId === otherSessionId,
    );
    expect(revoked).toBeUndefined();
  });
});
