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

describe('health endpoints', () => {
  let pgEnv: PgTestEnv;

  beforeAll(async () => {
    pgEnv = await startPgTestEnv();
    const migration = await migrateToLatest(pgEnv.pool);
    expect(migration.ok).toBe(true);
  }, 120_000);

  afterAll(async () => {
    await stopPgTestEnv(pgEnv);
  });

  it('livez returns ok without DB dependency', async () => {
    const config = loadCloudConfig(testCloudEnv(pgEnv.databaseUrl));
    const app = createCloudApp({ config, pool: pgEnv.pool });
    const res = await request(app).get('/livez');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.header['x-request-id']).toBeTruthy();
  });

  it('readyz succeeds after migrations', async () => {
    const config = loadCloudConfig(testCloudEnv(pgEnv.databaseUrl));
    const app = createCloudApp({ config, pool: pgEnv.pool });
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.db).toBe(true);
    expect(res.body.schemaVersion).toBe(10);
    expect(res.body).not.toHaveProperty('tokenSigningKey');
  });

  it('meta route returns api version without secrets', async () => {
    const config = loadCloudConfig(testCloudEnv(pgEnv.databaseUrl));
    const app = createCloudApp({ config, pool: pgEnv.pool });
    const res = await request(app).get('/api/cloud/v1/meta');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.apiVersion).toBe('v1');
    expect(res.body.data.registrationMode).toBe('closed');
    expect(JSON.stringify(res.body)).not.toContain('CLOUD_TOKEN');
  });
});
