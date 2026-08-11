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

describe('auth routes', () => {
  let pgEnv: PgTestEnv;
  let app: ReturnType<typeof createCloudApp>;
  let agent: ReturnType<typeof request>;

  beforeAll(async () => {
    pgEnv = await startPgTestEnv();
    const migration = await migrateToLatest(pgEnv.pool);
    expect(migration.ok).toBe(true);
    const config = loadCloudConfig(testCloudEnv(pgEnv.databaseUrl));
    app = createCloudApp({ config, pool: pgEnv.pool });
    agent = request.agent(app);
  }, 120_000);

  afterAll(async () => {
    await stopPgTestEnv(pgEnv);
  });

  it('rejects registration when mode is closed', async () => {
    const res = await agent.post('/api/cloud/v1/auth/register').send({
      username: 'teacher1',
      password: 'password123',
      displayName: 'Teacher One',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_REGISTRATION_CLOSED');
  });

  it('logs in with valid credentials', async () => {
    await seedTestAccount(pgEnv.pool, {
      username: 'teacher1',
      password: 'password123',
      displayName: 'Teacher One',
    });
    const res = await agent.post('/api/cloud/v1/auth/login').send({
      username: 'teacher1',
      password: 'password123',
      deviceLabel: 'MacBook',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.session.accountId).toMatch(/^acct_/);
    expect(JSON.stringify(res.body)).not.toMatch(/password123/);
  });

  it('returns the same message for unknown user and wrong password', async () => {
    const unknown = await agent.post('/api/cloud/v1/auth/login').send({
      username: 'missing_user',
      password: 'password123',
      deviceLabel: 'MacBook',
    });
    const wrong = await agent.post('/api/cloud/v1/auth/login').send({
      username: 'teacher1',
      password: 'wrong-password',
      deviceLabel: 'MacBook',
    });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    expect(unknown.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });
});

describe('auth routes — public registration', () => {
  let pgEnv: PgTestEnv;
  let agent: ReturnType<typeof request>;

  beforeAll(async () => {
    pgEnv = await startPgTestEnv();
    await migrateToLatest(pgEnv.pool);
    const env = testCloudEnv(pgEnv.databaseUrl);
    env.CLOUD_REGISTRATION_MODE = 'public';
    const config = loadCloudConfig(env);
    const app = createCloudApp({ config, pool: pgEnv.pool });
    agent = request.agent(app);
  }, 120_000);

  afterAll(async () => {
    await stopPgTestEnv(pgEnv);
  });

  it('registers when mode is public', async () => {
    const res = await agent.post('/api/cloud/v1/auth/register').send({
      username: 'new_teacher',
      password: 'password123',
      displayName: 'New Teacher',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeTruthy();
  });
});