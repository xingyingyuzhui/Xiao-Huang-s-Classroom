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
import { seedTestAccount } from './helpers/auth-fixtures.js';

describe('tenant isolation foundation', () => {
  let pgEnv: PgTestEnv;

  beforeAll(async () => {
    pgEnv = await startPgTestEnv();
    const migration = await migrateToLatest(pgEnv.pool);
    expect(migration.ok).toBe(true);
  }, 120_000);

  afterAll(async () => {
    await stopPgTestEnv(pgEnv);
  });

  it('creates cloud_app role without BYPASSRLS', async () => {
    const role = await pgEnv.pool.query<{ rolname: string; rolbypassrls: boolean }>(
      `SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = 'cloud_app'`,
    );
    expect(role.rowCount).toBe(1);
    expect(role.rows[0]?.rolbypassrls).toBe(false);
  });

  it('tenant-check uses authenticated principal, not client headers', async () => {
    await seedTestAccount(pgEnv.pool, {
      username: 'tenant_user',
      password: 'password123',
      displayName: 'Tenant User',
    });
    const config = loadCloudConfig(testCloudEnv(pgEnv.databaseUrl));
    const app = createCloudApp({ config, pool: pgEnv.pool });
    const agent = request.agent(app);
    const login = await agent.post('/api/cloud/v1/auth/login').send({
      username: 'tenant_user',
      password: 'password123',
      deviceLabel: 'Test',
    });
    const token = login.body.data.accessToken;
    const res = await agent
      .get('/api/cloud/v1/_internal/tenant-check')
      .set('Authorization', `Bearer ${token}`)
      .set('x-account-id', 'attacker-account');
    expect(res.status).toBe(200);
    expect(res.body.data.accountId).not.toBe('attacker-account');
    expect(res.body.data.trusted).toBe(true);
  });

  it('rejects oversized bodies before handler', async () => {
    const env = testCloudEnv(pgEnv.databaseUrl);
    env.CLOUD_BODY_LIMIT_BYTES = '1024';
    const config = loadCloudConfig(env);
    const app = createCloudApp({ config, pool: pgEnv.pool });
    const res = await request(app)
      .post('/api/cloud/v1/meta')
      .set('Content-Length', '9999')
      .send({ huge: 'payload' });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
