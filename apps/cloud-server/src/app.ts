import express from 'express';
import type { CloudConfig } from './config.js';
import type { DbPool } from './db/pool.js';
import { pingDb } from './db/pool.js';
import { getSchemaVersion, MAX_MIGRATION_VERSION } from './db/migrate.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { bodyLimitMiddleware } from './middleware/body-limit.js';
import { authPrincipalMiddleware } from './middleware/auth-principal.js';
import { errorHandler } from './middleware/error-handler.js';

export type CloudAppDeps = {
  config: CloudConfig;
  pool: DbPool;
};

export function createCloudApp(deps: CloudAppDeps): express.Application {
  const { config, pool } = deps;
  const app = express();

  app.disable('x-powered-by');
  if (config.trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(requestIdMiddleware);
  app.use(bodyLimitMiddleware(config));
  app.use(express.json({ limit: config.bodyLimitBytes }));
  app.use(authPrincipalMiddleware);

  app.get('/livez', (_req, res) => {
    res.status(200).json({ ok: true, service: 'cloud-server' });
  });

  app.get('/readyz', async (req, res) => {
    try {
      const dbOk = await pingDb(pool);
      const schemaVersion = dbOk ? await getSchemaVersion(pool) : 0;
      const ready = dbOk && schemaVersion >= 1 && schemaVersion <= MAX_MIGRATION_VERSION;
      res.status(ready ? 200 : 503).json({
        ok: ready,
        db: dbOk,
        schemaVersion,
        maxAppSchemaVersion: MAX_MIGRATION_VERSION,
        requestId: req.requestId,
      });
    } catch {
      res.status(503).json({
        ok: false,
        db: false,
        requestId: req.requestId,
      });
    }
  });

  app.get('/api/cloud/v1/meta', async (req, res) => {
    const schemaVersion = await getSchemaVersion(pool);
    res.json({
      success: true,
      data: {
        apiVersion: 'v1',
        schemaVersion,
        registrationMode: config.registrationMode,
        publicOrigin: config.publicOrigin,
      },
      requestId: req.requestId,
    });
  });

  // Tenant isolation stub — returns 501 until sync/auth tables exist
  app.get('/api/cloud/v1/_internal/tenant-check', async (req, res) => {
    res.status(501).json({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Tenant isolation routes ship with cloud-auth (Task 4)',
      },
      requestId: req.requestId,
    });
  });

  app.use(errorHandler(config));
  return app;
}
