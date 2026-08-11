import express from 'express';
import type { CloudConfig } from './config.js';
import type { DbPool } from './db/pool.js';
import { pingDb } from './db/pool.js';
import { getSchemaVersion, MAX_MIGRATION_VERSION } from './db/migrate.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { bodyLimitMiddleware } from './middleware/body-limit.js';
import { createAuthPrincipalMiddleware } from './middleware/auth-principal.js';
import { cookieParser } from './middleware/cookies.js';
import { errorHandler } from './middleware/error-handler.js';
import { createAuthRouter } from './auth/routes.js';
import { createAccountsRouter } from './accounts/routes.js';
import { createDevicesRouter } from './devices/routes.js';
import { createClassesRouter, createTrashRouter } from './classes/routes.js';
import { createSyncRouter } from './sync/routes.js';
import { createAiRouter } from './ai/routes.js';

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
  app.use(cookieParser());
  app.use(express.json({ limit: config.bodyLimitBytes }));
  app.use(createAuthPrincipalMiddleware(config, pool));

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

  const v1 = express.Router();
  v1.use('/auth', createAuthRouter(config, pool));
  v1.use('/account', createAccountsRouter(pool));
  v1.use('/devices', createDevicesRouter(pool));
  v1.use('/classes', createClassesRouter(pool));
  v1.use('/trash', createTrashRouter(pool));
  v1.use('/sync', createSyncRouter(pool));
  v1.use('/ai', createAiRouter(config, pool));
  app.use('/api/cloud/v1', v1);

  app.get('/api/cloud/v1/_internal/tenant-check', requireAuthTenantCheck);

  app.use(errorHandler(config));
  return app;
}

function requireAuthTenantCheck(req: express.Request, res: express.Response): void {
  const accountId = req.principal?.accountId;
  if (!accountId) {
    res.status(401).json({
      success: false,
      error: { code: 'AUTH_SESSION_EXPIRED', message: '请先登录' },
      requestId: req.requestId,
    });
    return;
  }
  res.json({
    success: true,
    data: { accountId, trusted: true },
    requestId: req.requestId,
  });
}
