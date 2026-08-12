import { Router } from 'express';
import { z } from 'zod';
import { classSubjectWorkspaceSchema } from '@xiaohuang/contracts';
import type { DbPool } from '../db/pool.js';
import { ClassService } from '../classes/service.js';
import { requireAuth, requireFullScope, validateBody } from '../middleware/guards.js';

const ensurePersonalBodySchema = z.object({
  subjectId: z.string().min(1).max(64),
});

const ensureClassBodySchema = z.object({
  classId: z.string().min(1).max(128),
  subjectId: z.string().min(1).max(64),
});

export function createWorkspacesRouter(pool: DbPool): Router {
  const router = Router();
  const classes = new ClassService(pool);

  router.post(
    '/personal',
    requireAuth,
    requireFullScope,
    validateBody(ensurePersonalBodySchema),
    async (req, res, next) => {
      try {
        const body = req.body as { subjectId: string };
        const workspace = await classes.ensurePersonalWorkspace(
          req.principal!.accountId!,
          body.subjectId,
        );
        res.json({
          success: true,
          data: classSubjectWorkspaceSchema.parse(workspace),
          requestId: req.requestId,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/class',
    requireAuth,
    requireFullScope,
    validateBody(ensureClassBodySchema),
    async (req, res, next) => {
      try {
        const body = req.body as { classId: string; subjectId: string };
        const workspace = await classes.ensureClassWorkspace(
          req.principal!.accountId!,
          body.classId,
          body.subjectId,
        );
        res.json({
          success: true,
          data: classSubjectWorkspaceSchema.parse(workspace),
          requestId: req.requestId,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
