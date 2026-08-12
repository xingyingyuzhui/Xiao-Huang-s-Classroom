/**
 * One-shot migration CLI. Applies pending SQL and exits.
 * Does not listen on a port. Deploy must call `node dist/migrate.js`,
 * not `node dist/server.js --migrate-only`.
 */
import pg from 'pg';
import { migrateToLatest } from './db/migrate.js';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[migrate] DATABASE_URL is required');
    process.exitCode = 1;
    return;
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  try {
    const result = await migrateToLatest(pool);
    if (!result.ok) {
      console.error(`[migrate] ${result.code}: ${result.message}`);
      process.exitCode = 1;
      return;
    }
    const applied = result.applied.length > 0 ? result.applied.join(',') : 'none';
    console.log(`[migrate] ok from=${result.from} to=${result.to} applied=${applied}`);
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[migrate] ${message}`);
  process.exit(1);
});
