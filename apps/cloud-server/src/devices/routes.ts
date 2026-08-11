import { Router } from 'express';
import type { DbPool } from '../db/pool.js';
import { DeviceService } from './service.js';
import { requireAuth, requireFullScope } from '../middleware/guards.js';

export function createDevicesRouter(pool: DbPool): Router {
  const router = Router();
  const devices = new DeviceService(pool);

  router.get('/', requireAuth, requireFullScope, async (req, res, next) => {
    try {
      const list = await devices.listDevices(
        req.principal!.accountId!,
        req.principal!.sessionId,
      );
      res.json({ success: true, data: list, requestId: req.requestId });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:sessionId', requireAuth, requireFullScope, async (req, res, next) => {
    try {
      const result = await devices.revokeDevice(
        req.principal!.accountId!,
        req.params.sessionId!,
        req.principal!.sessionId,
      );
      res.json({ success: true, data: result, requestId: req.requestId });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
