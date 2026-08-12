/** Audit event names. Detail must be metadata-only (no secrets, roster, or chat). */
export const AUDIT_EVENTS = {
  AUTH_LOGIN_SUCCESS: 'auth.login_success',
  AUTH_LOGIN_FAIL: 'auth.login_fail',
  AUTH_REFRESH_REUSE: 'auth.refresh_reuse',
  DEVICE_REVOKE: 'device.revoke',
  CLASS_DELETE: 'class.delete',
  CLASS_RESTORE: 'class.restore',
  AI_CREDENTIAL_SET: 'ai.credential_set',
  AI_CREDENTIAL_REMOVE: 'ai.credential_remove',
  ACCOUNT_DELETION_REQUESTED: 'account.deletion_requested',
  ACCOUNT_DELETION_CANCELLED: 'account.deletion_cancelled',
  ACCOUNT_DELETION_COMPLETED: 'account.deletion_completed',
  ADMIN_CLEANUP: 'admin.cleanup',
} as const;

export type AuditEventType = (typeof AUDIT_EVENTS)[keyof typeof AUDIT_EVENTS];
