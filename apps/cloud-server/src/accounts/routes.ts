import { Router } from 'express';
import {
  accountDeletionRequestSchema,
  accountPasswordChangeSchema,
  accountProfilePatchSchema,
  accountProfileSchema,
} from '@xiaohuang/contracts';
import type { DbPool } from '../db/pool.js';
import { AccountService } from './service.js';
import { requireAuth, requireFullScope, validateBody } from '../middleware/guards.js';

export function createAccountsRouter(pool: DbPool): Router {
  const router = Router();
  const accounts = new AccountService(pool);

  router.get('/', requireAuth, requireFullScope, async (req, res, next) => {
    try {
      const profile = await accounts.getProfile(req.principal!.accountId!);
      res.json({
        success: true,
        data: accountProfileSchema.parse(profile),
        requestId: req.requestId,
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/', requireAuth, requireFullScope, validateBody(accountProfilePatchSchema), async (req, res, next) => {
    try {
      const body = req.body as { displayName?: string; avatarUrl?: string | null };
      const profile = await accounts.patchProfile(req.principal!.accountId!, body);
      res.json({
        success: true,
        data: accountProfileSchema.parse(profile),
        requestId: req.requestId,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/password/change',
    requireAuth,
    requireFullScope,
    validateBody(accountPasswordChangeSchema),
    async (req, res, next) => {
      try {
        const body = req.body as { currentPassword: string; newPassword: string };
        await accounts.changePassword(
          req.principal!.accountId!,
          body.currentPassword,
          body.newPassword,
        );
        res.json({ success: true, data: { ok: true }, requestId: req.requestId });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/deletion-request',
    requireAuth,
    validateBody(accountDeletionRequestSchema),
    async (req, res, next) => {
      try {
        const body = req.body as { confirmDisplayName: string };
        const data = await accounts.requestDeletion(
          req.principal!.accountId!,
          body.confirmDisplayName,
        );
        res.json({ success: true, data, requestId: req.requestId });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete('/deletion-request', requireAuth, async (req, res, next) => {
    try {
      const data = await accounts.cancelDeletion(req.principal!.accountId!);
      res.json({ success: true, data, requestId: req.requestId });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
