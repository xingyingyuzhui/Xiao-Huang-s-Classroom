import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadCloudConfig } from './config.js';
import { createDbPool, closeDbPool } from './db/pool.js';
import { migrateToLatest } from './db/migrate.js';
import { createCloudApp } from './app.js';

export async function startCloudServer(): Promise<{ close: () => Promise<void> }> {
  const config = loadCloudConfig();
  const pool = createDbPool(config);

  const migration = await migrateToLatest(pool);
  if (!migration.ok) {
    await closeDbPool(pool);
    throw new Error(`[cloud-server] migration failed: ${migration.code} ${migration.message}`);
  }

  const app = createCloudApp({ config, pool });
  const server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => resolve());
  });

  const close = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await closeDbPool(pool);
  };

  return { close };
}

const entryArg = process.argv[1];
const isDirectRun =
  entryArg != null &&
  (import.meta.url === pathToFileURL(entryArg).href ||
    entryArg.endsWith('/cloud-server/dist/server.js') ||
    entryArg.endsWith('\\cloud-server\\dist\\server.js'));

if (isDirectRun) {
  startCloudServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
