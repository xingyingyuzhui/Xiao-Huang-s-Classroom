import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@xiaohuang/domain-core';
import type { CloudConfig } from '../config.js';
import { redactSecrets } from '../config.js';

export function errorHandler(config: CloudConfig) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const requestId = req.requestId ?? 'unknown';
    if (err instanceof AppError) {
      res.status(400).json({
        success: false,
        error: {
          code: err.code,
          message: redactSecrets(err.message, config),
        },
        requestId,
      });
      return;
    }
    const message =
      err instanceof Error ? redactSecrets(err.message, config) : 'Internal server error';
    if (config.nodeEnv !== 'production') {
      console.error('[cloud-server]', requestId, err);
    }
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
      requestId,
    });
  };
}
