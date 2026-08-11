import type pg from 'pg';

/** PostgreSQL advisory lock for migration runner (single-flight). */
export const MIGRATION_ADVISORY_LOCK_KEY = 0x5848434c; // 'XHCL'

export async function withMigrationLock<T>(
  client: pg.PoolClient,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_ADVISORY_LOCK_KEY]);
  try {
    return await fn();
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_ADVISORY_LOCK_KEY]);
  }
}
