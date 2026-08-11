import type { Request, Response, NextFunction } from 'express';
import type { CloudConfig } from '../config.js';
import { verifyAccessToken } from '../auth/tokens.js';
import { SessionRepository } from '../db/repositories/session.js';
import type { DbPool } from '../db/pool.js';

export type AuthPrincipal = {
  accountId: string | null;
  sessionId?: string;
  deviceId?: string;
  scope?: 'full' | 'account:restore';
};

export function createAuthPrincipalMiddleware(config: CloudConfig, pool: DbPool) {
  const sessions = new SessionRepository(pool);

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const auth = req.header('authorization');
    if (!auth?.startsWith('Bearer ')) {
      req.principal = { accountId: null };
      next();
      return;
    }

    const token = auth.slice('Bearer '.length).trim();
    const claims = await verifyAccessToken(config, token);
    if (!claims) {
      req.principal = { accountId: null };
      next();
      return;
    }

    const session = await sessions.findById(claims.sessionId);
    if (!session || session.status !== 'active' || session.account_id !== claims.accountId) {
      req.principal = { accountId: null };
      next();
      return;
    }

    req.principal = {
      accountId: claims.accountId,
      sessionId: claims.sessionId,
      deviceId: claims.deviceId,
      scope: claims.scope,
    };
    next();
  };
}
