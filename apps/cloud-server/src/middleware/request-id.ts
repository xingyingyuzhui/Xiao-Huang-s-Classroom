import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
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
