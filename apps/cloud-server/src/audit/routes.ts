import { Router } from 'express';
import type { DbPool } from '../db/pool.js';
import { CleanupService } from './cleanup.js';
import { AuditService } from './service.js';
import { AUDIT_EVENTS } from './events.js';
import { requireAdmin, requireAuthOrScheduler } from './admin-guard.js';

export function createAdminRouter(pool: DbPool): Router {
  const router = Router();
  const cleanup = new CleanupService(pool);
  const audit = new AuditService(pool);

  router.post('/cleanup', requireAuthOrScheduler, requireAdmin, async (req, res, next) => {
    try {
      const counts = await cleanup.runAll();
      await audit.log({
        accountId: req.principal?.accountId ?? null,
        eventType: AUDIT_EVENTS.ADMIN_CLEANUP,
        detail: { trash: counts.trash, sessions: counts.sessions, audit: counts.audit },
        requestId: req.requestId,
        ipAddress: req.ip,
      });
      res.json({
        success: true,
        data: counts,
        requestId: req.requestId,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
