import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';

export type PgTestEnv = {
  container: StartedPostgreSqlContainer;
  pool: pg.Pool;
  databaseUrl: string;
};

export async function startPgTestEnv(): Promise<PgTestEnv> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = container.getConnectionUri();
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
  return { container, pool, databaseUrl };
}

export async function stopPgTestEnv(env: PgTestEnv): Promise<void> {
  await env.pool.end();
  await env.container.stop();
}

export function testCloudEnv(databaseUrl: string): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    CLOUD_TOKEN_SIGNING_KEY: 'test-token-signing-key-32chars-min!!',
    CLOUD_AI_KEK: 'test-ai-kek-32-characters-minimum!!',
    CLOUD_PUBLIC_ORIGIN: 'https://cloud.test.local',
    CLOUD_REGISTRATION_MODE: 'closed',
    CLOUD_BODY_LIMIT_BYTES: '1048576',
  };
}
