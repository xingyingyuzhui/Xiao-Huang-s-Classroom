import { Router } from 'express';
import { AppError } from '@xiaohuang/domain-core';
import {
  authLoginRequestSchema,
  authLogoutRequestSchema,
  authRefreshRequestSchema,
  authRegisterRequestSchema,
  authSessionSchema,
} from '@xiaohuang/contracts';
import type { CloudConfig } from '../config.js';
import type { DbPool } from '../db/pool.js';
import { AuditService } from '../audit/service.js';
import { AUDIT_EVENTS } from '../audit/events.js';
import { AuthService } from './service.js';
import {
  REFRESH_COOKIE_NAME,
  refreshCookieClearOptions,
  refreshCookieOptions,
} from './tokens.js';
import { validateBody, csrfProtect } from '../middleware/guards.js';
import {
  loginRateLimit,
  refreshRateLimit,
  registerRateLimit,
} from '../middleware/rate-limit.js';

export function createAuthRouter(config: CloudConfig, pool: DbPool): Router {
  const router = Router();
  const auth = new AuthService(pool, config);
  const audit = new AuditService(pool);
  const csrf = csrfProtect(config);
  const limitLogin = loginRateLimit();
  const limitRefresh = refreshRateLimit();
  const limitRegister = registerRateLimit();

  router.post(
    '/register',
    validateBody(authRegisterRequestSchema),
    limitRegister,
    async (req, res, next) => {
      try {
        const body = req.body as {
          username: string;
          password: string;
          displayName: string;
          inviteCode?: string;
          deviceId?: string;
          deviceLabel?: string;
        };
        const result = await auth.register({
          username: body.username,
          password: body.password,
          displayName: body.displayName,
          deviceLabel: body.deviceLabel ?? 'Web',
          ...(body.inviteCode !== undefined ? { inviteCode: body.inviteCode } : {}),
          ...(body.deviceId !== undefined ? { deviceId: body.deviceId } : {}),
        });
        const refreshExpiresAt = new Date(result.session.refreshExpiresAt);
        res
          .cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions(config, refreshExpiresAt))
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
    },
  );

  router.post(
    '/login',
    validateBody(authLoginRequestSchema),
    limitLogin,
    async (req, res, next) => {
      try {
        const body = req.body as {
          username: string;
          password: string;
          deviceLabel: string;
          deviceId?: string;
        };
        const result = await auth.login(body);
        await audit.log({
          accountId: result.session.accountId,
          eventType: AUDIT_EVENTS.AUTH_LOGIN_SUCCESS,
          detail: { deviceId: result.session.deviceId },
          requestId: req.requestId,
          ipAddress: req.ip,
        });
        const refreshExpiresAt = new Date(result.session.refreshExpiresAt);
        res
          .cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions(config, refreshExpiresAt))
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
        if (error instanceof AppError && error.code === 'AUTH_INVALID_CREDENTIALS') {
          await audit.log({
            accountId: null,
            eventType: AUDIT_EVENTS.AUTH_LOGIN_FAIL,
            detail: { reason: 'invalid_credentials' },
            requestId: req.requestId,
            ipAddress: req.ip,
          });
        }
        next(error);
      }
    },
  );

  router.post(
    '/refresh',
    csrf,
    validateBody(authRefreshRequestSchema),
    limitRefresh,
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
        const refreshExpiresAt = new Date(result.session.refreshExpiresAt);
        res
          .cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions(config, refreshExpiresAt))
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
        if (error instanceof AppError && error.code === 'AUTH_REFRESH_REUSE') {
          await audit.log({
            accountId: null,
            eventType: AUDIT_EVENTS.AUTH_REFRESH_REUSE,
            detail: { deviceId: (req.body as { deviceId?: string }).deviceId ?? null },
            requestId: req.requestId,
            ipAddress: req.ip,
          });
        }
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
        const accountId = req.principal?.accountId ?? undefined;
        const sessionId = req.principal?.sessionId;
        const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
        const body = req.body as { deviceId?: string; allDevices?: boolean };
        await auth.logout({
          ...(accountId ? { accountId } : {}),
          ...(sessionId ? { sessionId } : {}),
          ...(typeof refreshToken === 'string' && refreshToken ? { refreshToken } : {}),
          ...(body.allDevices !== undefined ? { allDevices: body.allDevices } : {}),
        });
        res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieClearOptions(config));
        res.json({ success: true, data: { ok: true }, requestId: req.requestId });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
