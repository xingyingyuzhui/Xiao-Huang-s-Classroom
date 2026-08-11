import { Router } from 'express';
import {
  classCopyRequestSchema,
  classCreateRequestSchema,
  classPatchRequestSchema,
  classRecordSchema,
} from '@xiaohuang/contracts';
import type { DbPool } from '../db/pool.js';
import { ClassService } from './service.js';
import { requireAuth, requireFullScope, validateBody } from '../middleware/guards.js';

export function createClassesRouter(pool: DbPool): Router {
  const router = Router();
  const classes = new ClassService(pool);

  router.get('/', requireAuth, requireFullScope, async (req, res, next) => {
    try {
      const data = await classes.listClasses(req.principal!.accountId!);
      res.json({
        success: true,
        data: data.map((record) => classRecordSchema.parse(record)),
        requestId: req.requestId,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/',
    requireAuth,
    requireFullScope,
    validateBody(classCreateRequestSchema),
    async (req, res, next) => {
      try {
        const body = req.body as { name: string };
        const record = await classes.createClass(req.principal!.accountId!, body.name);
        res.status(201).json({
          success: true,
          data: classRecordSchema.parse(record),
          requestId: req.requestId,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    '/:id',
    requireAuth,
    requireFullScope,
    validateBody(classPatchRequestSchema),
    async (req, res, next) => {
      try {
        const body = req.body as { name?: string; archived?: boolean };
        const record = await classes.patchClass(req.principal!.accountId!, req.params.id!, body);
        res.json({
          success: true,
          data: classRecordSchema.parse(record),
          requestId: req.requestId,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/:id/copy',
    requireAuth,
    requireFullScope,
    validateBody(classCopyRequestSchema),
    async (req, res, next) => {
      try {
        const body = req.body as { name: string; includeProgress?: boolean };
        const record = await classes.copyClass(req.principal!.accountId!, req.params.id!, body);
        res.status(201).json({
          success: true,
          data: classRecordSchema.parse(record),
          requestId: req.requestId,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete('/:id', requireAuth, requireFullScope, async (req, res, next) => {
    try {
      const record = await classes.deleteClass(req.principal!.accountId!, req.params.id!);
      res.json({
        success: true,
        data: classRecordSchema.parse(record),
        requestId: req.requestId,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/restore', requireAuth, requireFullScope, async (req, res, next) => {
    try {
      const record = await classes.restoreClass(req.principal!.accountId!, req.params.id!);
      res.json({
        success: true,
        data: classRecordSchema.parse(record),
        requestId: req.requestId,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function createTrashRouter(pool: DbPool): Router {
  const router = Router();
  const classes = new ClassService(pool);

  router.get('/classes', requireAuth, requireFullScope, async (req, res, next) => {
    try {
      const data = await classes.listTrash(req.principal!.accountId!);
      res.json({
        success: true,
        data: data.map((record) => classRecordSchema.parse(record)),
        requestId: req.requestId,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
