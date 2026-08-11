import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '@xiaohuang/domain-core';

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(new AppError('VALIDATION_SCHEMA', '请求参数无效'));
      return;
    }
    req.body = parsed.data;
    next();
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.principal?.accountId) {
    next(new AppError('AUTH_SESSION_EXPIRED', '请先登录'));
    return;
  }
  next();
}

export function requireFullScope(req: Request, _res: Response, next: NextFunction): void {
  if (req.principal?.scope !== 'full') {
    next(new AppError('FORBIDDEN_TENANT', '当前会话权限不足'));
    return;
  }
  next();
}

export function csrfProtect(config: { publicOrigin: string }) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const origin = req.header('origin');
    if (origin && origin !== config.publicOrigin) {
      next(new AppError('FORBIDDEN_TENANT', '请求来源无效'));
      return;
    }
    next();
  };
}
