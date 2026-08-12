import { Router } from 'express';
import type { DbPool } from '../db/pool.js';
import { AuditService } from '../audit/service.js';
import { AUDIT_EVENTS } from '../audit/events.js';
import { DeviceService } from './service.js';
import { requireAuth, requireFullScope } from '../middleware/guards.js';

export function createDevicesRouter(pool: DbPool): Router {
  const router = Router();
  const devices = new DeviceService(pool);
  const audit = new AuditService(pool);

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
      if (result.revoked) {
        await audit.log({
          accountId: req.principal!.accountId!,
          eventType: AUDIT_EVENTS.DEVICE_REVOKE,
          detail: { sessionId: req.params.sessionId, current: result.current },
          requestId: req.requestId,
          ipAddress: req.ip,
        });
      }
      res.json({ success: true, data: result, requestId: req.requestId });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
