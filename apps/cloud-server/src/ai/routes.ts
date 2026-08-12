import { Router } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CloudConfig } from '../config.js';
import type { DbPool } from '../db/pool.js';
import { AuditService } from '../audit/service.js';
import { AUDIT_EVENTS } from '../audit/events.js';
import { AiService } from './service.js';
import { requireAuth, requireFullScope, validateBody } from '../middleware/guards.js';

const ALLOWED_PROVIDERS = ['openai', 'deepseek'] as const;

const setCredentialSchema = z.object({
  provider: z.enum(ALLOWED_PROVIDERS),
  model: z.string().min(1).max(100),
  apiKey: z.string().min(8).max(500),
});

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(32),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(4096).optional(),
});

/** Derive a 32-byte AES-256 key from the config secret (may be arbitrary-length string). */
function deriveKek(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function createAiRouter(
  config: CloudConfig,
  pool: DbPool,
  fetchImpl?: typeof fetch,
): Router {
  const router = Router();
  const kek = deriveKek(config.aiKek);
  const kekVersion = 1;
  const ai = new AiService(pool, kek, kekVersion, fetchImpl);
  const audit = new AuditService(pool);

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
        await audit.log({
          accountId: req.principal!.accountId!,
          eventType: AUDIT_EVENTS.AI_CREDENTIAL_SET,
          detail: { provider, model },
          requestId: req.requestId,
          ipAddress: req.ip,
        });
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
      await audit.log({
        accountId: req.principal!.accountId!,
        eventType: AUDIT_EVENTS.AI_CREDENTIAL_REMOVE,
        detail: { removed: true },
        requestId: req.requestId,
        ipAddress: req.ip,
      });
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

  router.post(
    '/chat',
    requireAuth,
    requireFullScope,
    validateBody(chatSchema),
    async (req, res, next) => {
      try {
        const body = req.body as z.infer<typeof chatSchema>;
        const result = await ai.chat(req.principal!.accountId!, {
          messages: body.messages,
          ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
          ...(body.maxTokens !== undefined ? { maxTokens: body.maxTokens } : {}),
        });
        res.json({
          success: true,
          data: { text: result.text, model: result.model },
          requestId: req.requestId,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post('/quiz', requireAuth, requireFullScope, (req, res) => {
    res.status(501).json({
      success: false,
      error: { code: 'AUTH_FEATURE_DISABLED', message: '请使用 POST /api/cloud/v1/ai/chat' },
      requestId: req.requestId,
    });
  });

  router.post('/lesson', requireAuth, requireFullScope, (req, res) => {
    res.status(501).json({
      success: false,
      error: { code: 'AUTH_FEATURE_DISABLED', message: '请使用 POST /api/cloud/v1/ai/chat' },
      requestId: req.requestId,
    });
  });

  return router;
}
