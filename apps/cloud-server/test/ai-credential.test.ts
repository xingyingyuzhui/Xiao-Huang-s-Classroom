import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';
import { createCloudApp } from '../src/app.js';
import { loadCloudConfig } from '../src/config.js';
import { migrateToLatest } from '../src/db/migrate.js';
import { encryptApiKey, decryptApiKey } from '../src/ai/encryption.js';
import { reserveQuota } from '../src/ai/quota.js';
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
  let accountIdA: string;

  beforeAll(async () => {
    pgEnv = await startPgTestEnv();
    const migration = await migrateToLatest(pgEnv.pool);
    expect(migration.ok).toBe(true);

    const config = loadCloudConfig(testCloudEnv(pgEnv.databaseUrl));
    app = createCloudApp({ config, pool: pgEnv.pool });
    agent = request.agent(app);

    const seededA = await seedTestAccount(pgEnv.pool, {
      username: 'ai_user_a',
      password: 'password123',
      displayName: 'User A',
    });
    accountIdA = seededA.accountId;
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

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('quiz and lesson endpoints are stubbed 501', async () => {
    const quiz = await agent
      .post('/api/cloud/v1/ai/quiz')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({});
    expect(quiz.status).toBe(501);
    const lesson = await agent
      .post('/api/cloud/v1/ai/lesson')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({});
    expect(lesson.status).toBe(501);
  });

  it('proxies chat, returns model text only, and never echoes the key', async () => {
    const secret = 'sk-proxy-secret-key-AAAA';
    await agent
      .put('/api/cloud/v1/ai/credential')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ provider: 'deepseek', model: 'deepseek-v4-flash', apiKey: secret });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toBe(`Bearer ${secret}`);
        return {
          ok: true,
          json: async () => ({
            model: 'deepseek-v4-flash',
            choices: [{ message: { content: '  云端回复  ' } }],
          }),
        };
      }),
    );

    const res = await agent
      .post('/api/cloud/v1/ai/chat')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ messages: [{ role: 'user', content: '你好' }] });
    expect(res.status).toBe(200);
    expect(res.body.data.text).toBe('云端回复');
    expect(res.body.data.model).toBe('deepseek-v4-flash');
    expect(JSON.stringify(res.body)).not.toContain(secret);
    expect(JSON.stringify(res.body)).not.toContain('sk-proxy');
  });

  it('releases quota when the provider fails', async () => {
    await agent
      .put('/api/cloud/v1/ai/credential')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ provider: 'deepseek', model: 'deepseek-v4-flash', apiKey: 'sk-fail-key-12345678' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: { message: 'upstream down' } }),
      })),
    );

    const before = await agent
      .get('/api/cloud/v1/ai/usage')
      .set('Authorization', `Bearer ${tokenA}`);
    const usedBefore = before.body.data.daily.used as number;

    const res = await agent
      .post('/api/cloud/v1/ai/chat')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(502);

    const after = await agent
      .get('/api/cloud/v1/ai/usage')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(after.body.data.daily.used).toBe(usedBefore);
  });

  it('atomic reserve: second sequential call is rejected at limit=1', async () => {
    await pgEnv.pool.query(
      `INSERT INTO ai_quota (account_id, daily_limit, monthly_limit)
       VALUES ($1, 1, 2000)
       ON CONFLICT (account_id) DO UPDATE SET daily_limit = 1`,
      [accountIdA],
    );
    await pgEnv.pool.query(`DELETE FROM ai_usage WHERE account_id = $1`, [accountIdA]);

    const first = await reserveQuota(pgEnv.pool, accountIdA);
    expect(first.daily.used).toBe(1);
    await expect(reserveQuota(pgEnv.pool, accountIdA)).rejects.toMatchObject({
      code: 'QUOTA_DAILY_EXCEEDED',
    });
  });

  it('atomic reserve: parallel callers cannot both pass a limit of 1', async () => {
    await pgEnv.pool.query(
      `INSERT INTO ai_quota (account_id, daily_limit, monthly_limit)
       VALUES ($1, 1, 2000)
       ON CONFLICT (account_id) DO UPDATE SET daily_limit = 1`,
      [accountIdA],
    );
    await pgEnv.pool.query(`DELETE FROM ai_usage WHERE account_id = $1`, [accountIdA]);

    const results = await Promise.allSettled([
      reserveQuota(pgEnv.pool, accountIdA),
      reserveQuota(pgEnv.pool, accountIdA),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const denied = results.filter(
      (r) => r.status === 'rejected' && (r.reason as { code?: string })?.code === 'QUOTA_DAILY_EXCEEDED',
    );
    expect(ok).toHaveLength(1);
    expect(denied).toHaveLength(1);
  });
});
