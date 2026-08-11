/**
 * AppError 与稳定错误码（spec §7.3）。
 * 错误码是跨端稳定的标识；消息只用于展示，不得作为程序分支依据。
 */
export const ErrorCode = [
  'VALIDATION_COEFFS_NOT_FINITE',
  'VALIDATION_DOCUMENT_INVALID',
  'VALIDATION_SCHEMA',
  'PERSISTENCE_READ',
  'PERSISTENCE_WRITE',
  'PERSISTENCE_MIGRATION',
  'NETWORK_TIMEOUT',
  'NETWORK_OFFLINE',
  'DATABASE_OPEN',
  'DATABASE_QUERY',
  'DATABASE_MIGRATION',
  'AI_REQUEST',
  'AI_TIMEOUT',
  'AI_RESPONSE_INVALID',
  'RENDERER_FAILED',
  'RENDERER_FATAL',
  'LIFECYCLE_DISPOSE',
  'LIFECYCLE_MOUNT',
  'IPC_DENIED',
  'IPC_INVALID_PAYLOAD',
  'INTERNAL_UNKNOWN',
  // Account / cloud stable codes (Task 2)
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_SESSION_EXPIRED',
  'AUTH_REFRESH_REUSE',
  'AUTH_RATE_LIMITED',
  'AUTH_REGISTRATION_CLOSED',
  'AUTH_FEATURE_DISABLED',
  'FORBIDDEN_TENANT',
  'FORBIDDEN_WORKSPACE',
  'ACCOUNT_NOT_FOUND',
  'ACCOUNT_PENDING_DELETION',
  'CLASS_NOT_FOUND',
  'CLASS_TRASHED',
  'SYNC_CONFLICT',
  'SYNC_CURSOR_STALE',
  'SYNC_PAYLOAD_TOO_LARGE',
  'SYNC_IDEMPOTENT_REPLAY',
  'CONFLICT_UNRESOLVED',
  'QUOTA_DAILY_EXCEEDED',
  'QUOTA_MONTHLY_EXCEEDED',
  'CREDENTIAL_NOT_CONFIGURED',
  'CREDENTIAL_INVALID',
] as const;

export type ErrorCode = (typeof ErrorCode)[number];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly scope: string;

  constructor(code: ErrorCode, message: string, scope = 'domain') {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.scope = scope;
  }
}

/** 从任意 Error 归一化稳定错误码（未知错误 → INTERNAL_UNKNOWN）。 */
export function errorCodeOf(error: unknown): ErrorCode {
  if (error instanceof AppError) return error.code;
  return 'INTERNAL_UNKNOWN';
}
