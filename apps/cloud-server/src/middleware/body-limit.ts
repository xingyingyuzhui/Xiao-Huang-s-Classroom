import type { Request, Response, NextFunction } from 'express';
import type { CloudConfig } from '../config.js';

export function bodyLimitMiddleware(config: CloudConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const len = Number(req.header('content-length') ?? 0);
    if (Number.isFinite(len) && len > config.bodyLimitBytes) {
      res.status(413).json({
        success: false,
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' },
        requestId: req.requestId ?? 'unknown',
      });
      return;
    }
    next();
  };
}
