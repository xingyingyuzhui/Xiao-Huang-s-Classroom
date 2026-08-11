import { Router } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CloudConfig } from '../config.js';
import type { DbPool } from '../db/pool.js';
import { AiService } from './service.js';
import { requireAuth, requireFullScope, validateBody } from '../middleware/guards.js';

const ALLOWED_PROVIDERS = ['openai', 'deepseek'] as const;

const setCredentialSchema = z.object({
  provider: z.enum(ALLOWED_PROVIDERS),
  model: z.string().min(1).max(100),
  apiKey: z.string().min(8).max(500),
});

/** Derive a 32-byte AES-256 key from the config secret (may be arbitrary-length string). */
function deriveKek(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function createAiRouter(config: CloudConfig, pool: DbPool): Router {
  const router = Router();
  const kek = deriveKek(config.aiKek);
  const kekVersion = 1;
  const ai = new AiService(pool, kek, kekVersion);

  router.get('/credential', requireAuth, requireFullScope, async (req, res, next) => {
    try {
      const meta = await ai.getCredentialMetadata(req.principal!.accountId!);
      res.json({
        success: true,
        data: meta ?? { configured: false },
        requestId: req.requestId,
      });
    } catch (error) {
      next(error);
    }
  });

  router.put(
    '/credential',
    requireAuth,
    requireFullScope,
    validateBody(setCredentialSchema),
    async (req, res, next) => {
      try {
        const { provider, model, apiKey } = req.body as z.infer<typeof setCredentialSchema>;
        const meta = await ai.setCredential(req.principal!.accountId!, provider, model, apiKey);
        res.json({
          success: true,
          data: meta,
          requestId: req.requestId,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete('/credential', requireAuth, requireFullScope, async (req, res, next) => {
    try {
      await ai.removeCredential(req.principal!.accountId!);
      res.json({
        success: true,
        data: { removed: true },
        requestId: req.requestId,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/usage', requireAuth, requireFullScope, async (req, res, next) => {
    try {
      const usage = await ai.getUsageSummary(req.principal!.accountId!);
      res.json({
        success: true,
        data: usage,
        requestId: req.requestId,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
