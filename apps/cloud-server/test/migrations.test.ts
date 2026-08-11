import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { migrateToLatest, getSchemaVersion } from '../src/db/migrate.js';
import {
  startPgTestEnv,
  stopPgTestEnv,
  type PgTestEnv,
} from './helpers/pg-test-container.js';

describe('postgres migrations — happy path', () => {
  let pgEnv: PgTestEnv;

  beforeAll(async () => {
    pgEnv = await startPgTestEnv();
  }, 120_000);

  afterAll(async () => {
    await stopPgTestEnv(pgEnv);
  });

  it('applies platform migration on empty database', async () => {
    const first = await migrateToLatest(pgEnv.pool);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.applied).toContain(20);
      expect(first.to).toBe(20);
    }
    const version = await getSchemaVersion(pgEnv.pool);
    expect(version).toBe(20);
  });

  it('is idempotent on second run', async () => {
    const second = await migrateToLatest(pgEnv.pool);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.applied).toEqual([]);
    }
  });
});

describe('postgres migrations — checksum drift', () => {
  let pgEnv: PgTestEnv;

  beforeAll(async () => {
    pgEnv = await startPgTestEnv();
    const first = await migrateToLatest(pgEnv.pool);
    expect(first.ok).toBe(true);
  }, 120_000);

  afterAll(async () => {
    await stopPgTestEnv(pgEnv);
  });

  it('rejects checksum drift atomically', async () => {
    const badChecksum = crypto.createHash('sha256').update('tampered').digest('hex');
    await pgEnv.pool.query(
      'UPDATE cloud_schema_migrations SET checksum = $1 WHERE version = 1',
      [badChecksum],
    );
    const result = await migrateToLatest(pgEnv.pool);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('MIGRATION_CHECKSUM_MISMATCH');
    }
    const row = await pgEnv.pool.query(
      'SELECT COUNT(*)::int AS n FROM cloud_schema_migrations WHERE version = 1',
    );
    expect(row.rows[0].n).toBe(1);
  });
});

describe('postgres migrations — db newer than app', () => {
  let pgEnv: PgTestEnv;

  beforeAll(async () => {
    pgEnv = await startPgTestEnv();
    const first = await migrateToLatest(pgEnv.pool);
    expect(first.ok).toBe(true);
  }, 120_000);

  afterAll(async () => {
    await stopPgTestEnv(pgEnv);
  });

  it('rejects database newer than application', async () => {
    await pgEnv.pool.query(
      `INSERT INTO cloud_schema_migrations (version, filename, checksum)
       VALUES (999, '9999_future.sql', 'deadbeef')`,
    );
    const result = await migrateToLatest(pgEnv.pool);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('DB_NEWER_THAN_APP');
    }
  });
});
