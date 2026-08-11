import { Router } from 'express';
import type { DbPool } from '../db/pool.js';
import { CleanupService } from './cleanup.js';

export function createAdminRouter(pool: DbPool): Router {
  const router = Router();
  const cleanup = new CleanupService(pool);

  router.post('/cleanup', async (req, res) => {
    const accountId = req.principal?.accountId;
    if (!accountId) {
      res.status(401).json({
        success: false,
        error: { code: 'AUTH_SESSION_EXPIRED', message: '请先登录' },
        requestId: req.requestId,
      });
      return;
    }

    const counts = await cleanup.runAll();
    res.json({
      success: true,
      data: counts,
      requestId: req.requestId,
    });
  });

  return router;
}
