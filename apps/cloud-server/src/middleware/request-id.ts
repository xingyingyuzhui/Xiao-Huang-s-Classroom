import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Client-supplied request ids: charset + length only; reject paths/spaces/newlines. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export function sanitizeRequestId(incoming: string | undefined): string {
  if (incoming && SAFE_REQUEST_ID.test(incoming)) return incoming;
  return randomUUID();
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = sanitizeRequestId(req.header(REQUEST_ID_HEADER));
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      principal?: {
        accountId: string | null;
        sessionId?: string;
        deviceId?: string;
        scope?: 'full' | 'account:restore';
      };
    }
  }
}
