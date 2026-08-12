import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@xiaohuang/domain-core';
import { requireAuth } from '../middleware/guards.js';

const ADMIN_TOKEN_HEADER = 'x-cloud-admin-token';
const MIN_SCHEDULER_TOKEN_LENGTH = 32;

function readAdminAccountIds(): string[] {
  return (process.env.CLOUD_ADMIN_ACCOUNT_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function readSchedulerToken(): string {
  return process.env.CLOUD_ADMIN_TOKEN ?? '';
}

function tokensEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length || a.length === 0) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function isSchedulerRequest(req: Request): boolean {
  const expected = readSchedulerToken();
  if (expected.length < MIN_SCHEDULER_TOKEN_LENGTH) {
    return false;
  }
  const provided = req.header(ADMIN_TOKEN_HEADER) ?? '';
  return tokensEqual(provided, expected);
}

function isAdminAccount(accountId: string): boolean {
  return readAdminAccountIds().includes(accountId);
}

/** Authenticated session required unless the caller is the scheduler. */
export function requireAuthOrScheduler(req: Request, res: Response, next: NextFunction): void {
  if (isSchedulerRequest(req)) {
    next();
    return;
  }
  requireAuth(req, res, next);
}

/** Admin account allowlist (or scheduler token). Fail closed when unset. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (isSchedulerRequest(req)) {
    next();
    return;
  }

  const accountId = req.principal?.accountId;
  if (!accountId) {
    next(new AppError('AUTH_SESSION_EXPIRED', '请先登录'));
    return;
  }

  if (req.principal?.scope !== 'full' || !isAdminAccount(accountId)) {
    next(new AppError('FORBIDDEN_TENANT', '无权执行管理操作'));
    return;
  }

  next();
}
