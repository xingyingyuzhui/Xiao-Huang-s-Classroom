import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { MAX_MIGRATION_VERSION, MIGRATION_MANIFEST } from './migration-manifest.js';
import { withMigrationLock } from './migration-lock.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export type MigrationResult =
  | { ok: true; from: number; to: number; applied: number[] }
  | { ok: false; code: string; message: string; version?: number };

function migrationsDir(): string {
  return path.join(moduleDir, 'migrations');
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function readAppliedVersions(client: pg.PoolClient): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const exists = await client.query<{ regclass: string | null }>(
    "SELECT to_regclass('public.cloud_schema_migrations') AS regclass",
  );
  if (!exists.rows[0]?.regclass) {
    return map;
  }
  const rows = await client.query<{ version: number; checksum: string }>(
    'SELECT version, checksum FROM cloud_schema_migrations ORDER BY version ASC',
  );
  for (const row of rows.rows) {
    map.set(Number(row.version), row.checksum);
  }
  return map;
}

async function readMaxAppliedVersion(client: pg.PoolClient): Promise<number> {
  const applied = await readAppliedVersions(client);
  let max = 0;
  for (const version of applied.keys()) {
    max = Math.max(max, version);
  }
  return max;
}

export async function migrateToLatest(pool: pg.Pool): Promise<MigrationResult> {
  const client = await pool.connect();
  try {
    return await withMigrationLock(client, async () => {
      await client.query('BEGIN');
      try {
        const applied = await readAppliedVersions(client);
        let maxApplied = applied.size ? Math.max(...applied.keys()) : 0;

        for (const entry of MIGRATION_MANIFEST) {
          const existing = applied.get(entry.version);
          const filePath = path.join(migrationsDir(), entry.filename);
          if (!fs.existsSync(filePath)) {
            throw new Error(`missing migration file ${entry.filename}`);
          }
          const sql = fs.readFileSync(filePath, 'utf8');
          const checksum = sha256(sql);
          if (existing) {
            if (existing !== checksum) {
              await client.query('ROLLBACK');
              return {
                ok: false,
                code: 'MIGRATION_CHECKSUM_MISMATCH',
                message: `migration ${entry.version} checksum drift`,
                version: entry.version,
              };
            }
            continue;
          }
          const expected = maxApplied + 1;
          if (entry.version !== expected) {
            await client.query('ROLLBACK');
            return {
              ok: false,
              code: 'MIGRATION_GAP',
              message: `expected version ${expected}, found pending ${entry.version}`,
              version: entry.version,
            };
          }
          await client.query(sql);
          await client.query(
            `INSERT INTO cloud_schema_migrations (version, filename, checksum)
             VALUES ($1, $2, $3)`,
            [entry.version, entry.filename, checksum],
          );
          maxApplied = entry.version;
        }

        const afterMax = maxApplied;
        if (afterMax > MAX_MIGRATION_VERSION) {
          await client.query('ROLLBACK');
          return {
            ok: false,
            code: 'DB_NEWER_THAN_APP',
            message: `database schema ${afterMax} > app max ${MAX_MIGRATION_VERSION}`,
            version: afterMax,
          };
        }

        await client.query('COMMIT');
        const from = applied.size ? Math.min(...applied.keys()) : 0;
        const newlyApplied = MIGRATION_MANIFEST.filter((m) => !applied.has(m.version)).map(
          (m) => m.version,
        );
        return { ok: true, from, to: afterMax, applied: newlyApplied };
      } catch (error) {
        await client.query('ROLLBACK');
        return {
          ok: false,
          code: 'MIGRATION_FAILED',
          message: error instanceof Error ? error.message : String(error),
        };
      }
    });
  } finally {
    client.release();
  }
}

export async function getSchemaVersion(pool: pg.Pool): Promise<number> {
  const client = await pool.connect();
  try {
    return await readMaxAppliedVersion(client);
  } finally {
    client.release();
  }
}

export { MAX_MIGRATION_VERSION };
