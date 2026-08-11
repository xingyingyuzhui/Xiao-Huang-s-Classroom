import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';
import { createCloudApp } from '../src/app.js';
import { loadCloudConfig } from '../src/config.js';
import { migrateToLatest } from '../src/db/migrate.js';
import { encryptApiKey, decryptApiKey } from '../src/ai/encryption.js';
import {
  startPgTestEnv,
  stopPgTestEnv,
  testCloudEnv,
  type PgTestEnv,
} from './helpers/pg-test-container.js';
import { seedTestAccount, loginTestAccount } from './helpers/auth-fixtures.js';

describe('ai encryption round-trip', () => {
  it('encrypt then decrypt produces original key', () => {
    const kek = crypto.randomBytes(32);
    const apiKey = 'sk-test-abcdef1234567890';
    const encrypted = encryptApiKey(apiKey, kek, 1);
    const decrypted = decryptApiKey(encrypted, kek);
    expect(decrypted).toBe(apiKey);
  });

  it('wrong KEK fails to decrypt', () => {
    const kek = crypto.randomBytes(32);
    const wrongKek = crypto.randomBytes(32);
    const encrypted = encryptApiKey('sk-test-key', kek, 1);
    expect(() => decryptApiKey(encrypted, wrongKek)).toThrow();
  });
});

describe('ai credential routes', () => {
  let pgEnv: PgTestEnv;
  let app: ReturnType<typeof createCloudApp>;
  let agent: ReturnType<typeof request.agent>;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    pgEnv = await startPgTestEnv();
    const migration = await migrateToLatest(pgEnv.pool);
    expect(migration.ok).toBe(true);

    const config = loadCloudConfig(testCloudEnv(pgEnv.databaseUrl));
    app = createCloudApp({ config, pool: pgEnv.pool });
    agent = request.agent(app);

    await seedTestAccount(pgEnv.pool, {
      username: 'ai_user_a',
      password: 'password123',
      displayName: 'User A',
    });
    await seedTestAccount(pgEnv.pool, {
      username: 'ai_user_b',
      password: 'password456',
      displayName: 'User B',
      deviceId: 'dev_test_device_002',
    });

    const loginA = await loginTestAccount(agent, { username: 'ai_user_a', password: 'password123' });
    tokenA = loginA.accessToken;
    const loginB = await loginTestAccount(agent, { username: 'ai_user_b', password: 'password456', deviceId: 'dev_test_device_002' });
    tokenB = loginB.accessToken;
  }, 120_000);

  afterAll(async () => {
    await stopPgTestEnv(pgEnv);
  });

  it('returns configured:false when no credential set', async () => {
    const res = await agent
      .get('/api/cloud/v1/ai/credential')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.data.configured).toBe(false);
  });

  it('sets credential and returns metadata without key', async () => {
    const res = await agent
      .put('/api/cloud/v1/ai/credential')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test-abcdef1234567890' });
    expect(res.status).toBe(200);
    expect(res.body.data.provider).toBe('openai');
    expect(res.body.data.model).toBe('gpt-4o');
    expect(res.body.data.last4).toBe('7890');
    expect(res.body.data.configured).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('sk-test');
  });

  it('get credential returns metadata only', async () => {
    const res = await agent
      .get('/api/cloud/v1/ai/credential')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.data.configured).toBe(true);
    expect(res.body.data.last4).toBe('7890');
    expect(JSON.stringify(res.body)).not.toContain('ciphertext');
    expect(JSON.stringify(res.body)).not.toContain('sk-test');
  });

  it('updates credential replaces old one', async () => {
    const res = await agent
      .put('/api/cloud/v1/ai/credential')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-new-key-ending-WXYZ' });
    expect(res.status).toBe(200);
    expect(res.body.data.provider).toBe('deepseek');
    expect(res.body.data.last4).toBe('WXYZ');
  });

  it('rejects invalid provider', async () => {
    const res = await agent
      .put('/api/cloud/v1/ai/credential')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ provider: 'anthropic', model: 'claude-3', apiKey: 'sk-some-key-1234' });
    expect(res.status).toBe(400);
  });

  it('removes credential', async () => {
    const res = await agent
      .delete('/api/cloud/v1/ai/credential')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(true);

    const check = await agent
      .get('/api/cloud/v1/ai/credential')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(check.body.data.configured).toBe(false);
  });

  it('returns usage with default limits', async () => {
    const res = await agent
      .get('/api/cloud/v1/ai/usage')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.data.daily.limit).toBe(100);
    expect(res.body.data.monthly.limit).toBe(2000);
    expect(res.body.data.daily.used).toBe(0);
  });

  it('cross-tenant isolation — user B cannot see user A credential', async () => {
    await agent
      .put('/api/cloud/v1/ai/credential')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ provider: 'openai', model: 'gpt-4o', apiKey: 'sk-user-a-secret-key1' });

    const resB = await agent
      .get('/api/cloud/v1/ai/credential')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resB.body.data.configured).toBe(false);
  });

  it('requires auth', async () => {
    const res = await agent.get('/api/cloud/v1/ai/credential');
    expect(res.status).toBe(401);
  });
});
