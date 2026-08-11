import pg from 'pg';
import type { CloudConfig } from '../config.js';

export type DbPool = pg.Pool;

export function createDbPool(config: CloudConfig): DbPool {
  return new pg.Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export async function pingDb(pool: DbPool): Promise<boolean> {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT 1 AS ok');
    return result.rows[0]?.ok === 1;
  } finally {
    client.release();
  }
}

export async function closeDbPool(pool: DbPool): Promise<void> {
  await pool.end();
}
