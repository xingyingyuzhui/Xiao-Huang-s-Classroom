import { Router } from 'express';
import {
  authLoginRequestSchema,
  authLogoutRequestSchema,
  authRefreshRequestSchema,
  authRegisterRequestSchema,
  authSessionSchema,
} from '@xiaohuang/contracts';
import type { CloudConfig } from '../config.js';
import type { DbPool } from '../db/pool.js';
import { AuthService } from './service.js';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from './tokens.js';
import { validateBody, csrfProtect } from '../middleware/guards.js';

export function createAuthRouter(config: CloudConfig, pool: DbPool): Router {
  const router = Router();
  const auth = new AuthService(pool, config);
  const csrf = csrfProtect(config);

  router.post('/register', validateBody(authRegisterRequestSchema), async (req, res, next) => {
    try {
      const body = req.body as {
        username: string;
        password: string;
        displayName: string;
        inviteCode?: string;
      };
      const result = await auth.register({
        ...body,
        deviceLabel: body.displayName,
      });
      res
        .cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions(config))
        .status(201)
        .json({
          success: true,
          data: {
            session: authSessionSchema.parse({
              accountId: result.session.accountId,
              sessionId: result.session.sessionId,
              deviceId: result.session.deviceId,
              accessTokenExpiresAt: result.session.accessTokenExpiresAt,
            }),
            accessToken: result.session.accessToken,
          },
          requestId: req.requestId,
        });
    } catch (error) {
      next(error);
    }
  });

  router.post('/login', validateBody(authLoginRequestSchema), async (req, res, next) => {
    try {
      const body = req.body as {
        username: string;
        password: string;
        deviceLabel: string;
      };
      const result = await auth.login(body);
      res
        .cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions(config))
        .json({
          success: true,
          data: {
            session: authSessionSchema.parse({
              accountId: result.session.accountId,
              sessionId: result.session.sessionId,
              deviceId: result.session.deviceId,
              accessTokenExpiresAt: result.session.accessTokenExpiresAt,
            }),
            accessToken: result.session.accessToken,
          },
          requestId: req.requestId,
        });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/refresh',
    csrf,
    validateBody(authRefreshRequestSchema),
    async (req, res, next) => {
      try {
        const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
        if (typeof refreshToken !== 'string' || !refreshToken) {
          res.status(401).json({
            success: false,
            error: { code: 'AUTH_SESSION_EXPIRED', message: '会话已过期，请重新登录' },
            requestId: req.requestId,
          });
          return;
        }
        const body = req.body as { deviceId: string };
        const result = await auth.refresh(refreshToken, body.deviceId);
        res
          .cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions(config))
          .json({
            success: true,
            data: {
              session: authSessionSchema.parse({
                accountId: result.session.accountId,
                sessionId: result.session.sessionId,
                deviceId: result.session.deviceId,
                accessTokenExpiresAt: result.session.accessTokenExpiresAt,
              }),
              accessToken: result.session.accessToken,
            },
            requestId: req.requestId,
          });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/logout',
    csrf,
    validateBody(authLogoutRequestSchema),
    async (req, res, next) => {
      try {
        const accountId = req.principal?.accountId;
        const sessionId = req.principal?.sessionId;
        if (!accountId || !sessionId) {
          res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/cloud/v1/auth' });
          res.json({ success: true, data: { ok: true }, requestId: req.requestId });
          return;
        }
        const body = req.body as { deviceId: string; allDevices?: boolean };
        await auth.logout({
          accountId,
          sessionId,
          ...(body.allDevices !== undefined ? { allDevices: body.allDevices } : {}),
        });
        res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/cloud/v1/auth' });
        res.json({ success: true, data: { ok: true }, requestId: req.requestId });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
