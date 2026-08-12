import { Router } from 'express';
import { AppError } from '@xiaohuang/domain-core';
import {
  syncPullRequestSchema,
  syncPullResponseSchema,
  syncPushRequestSchema,
  syncPushResponseSchema,
  type SyncOperation,
} from '@xiaohuang/contracts';
import type { DbPool } from '../db/pool.js';
import { requireAuth, requireFullScope, validateBody } from '../middleware/guards.js';
import { SyncService } from './service.js';

export function createSyncRouter(pool: DbPool): Router {
  const router = Router();
  const sync = new SyncService(pool);

  router.post(
    '/push',
    requireAuth,
    requireFullScope,
    validateBody(syncPushRequestSchema),
    async (req, res, next) => {
      try {
        const body = req.body as { workspaceId: string; operations: SyncOperation[] };
        const result = await sync.push(req.principal!.accountId!, body.workspaceId, body.operations);
        const parsed = syncPushResponseSchema.parse({
          ...result,
          requestId: req.requestId,
        });
        // Re-attach cloud snapshots stripped by the summary-only contract schema.
        const data = {
          ...parsed,
          conflicts: result.conflicts,
        };
        res.json({
          success: true,
          data,
          requestId: req.requestId,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get('/pull', requireAuth, requireFullScope, async (req, res, next) => {
    try {
      const parsed = syncPullRequestSchema.safeParse({
        workspaceId: req.query.workspaceId,
        cursor: req.query.cursor ?? null,
        limit:
          req.query.limit === undefined ? undefined : Number.parseInt(String(req.query.limit), 10),
      });
      if (!parsed.success) {
        next(new AppError('VALIDATION_SCHEMA', '请求参数无效'));
        return;
      }

      const body = parsed.data;
      const result = await sync.pull(
        req.principal!.accountId!,
        body.workspaceId,
        body.cursor,
        body.limit,
      );
      const data = syncPullResponseSchema.parse({
        ...result,
        requestId: req.requestId,
      });
      res.json({
        success: true,
        data,
        requestId: req.requestId,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
