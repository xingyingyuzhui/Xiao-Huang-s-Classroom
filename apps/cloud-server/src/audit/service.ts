import type { DbPool } from '../db/pool.js';

export type AuditEvent = {
  accountId: string | null;
  eventType: string;
  detail: Record<string, unknown>;
  ipAddress?: string | undefined;
  requestId?: string | undefined;
};

const REDACT_KEYS = new Set([
  'password',
  'token',
  'refreshtoken',
  'refresh_token',
  'accesstoken',
  'access_token',
  'apikey',
  'api_key',
  'key',
  'secret',
  'authorization',
  'cookie',
  'roster',
  'students',
  'chat',
  'messages',
  'body',
  'payload',
]);

export class AuditService {
  constructor(private readonly pool: DbPool) {}

  async log(event: AuditEvent): Promise<void> {
    const sanitized = this.sanitize(event.detail);
    try {
      await this.pool.query(
        `INSERT INTO audit_log (account_id, event_type, detail, ip_address, request_id) VALUES ($1, $2, $3, $4, $5)`,
        [
          event.accountId,
          event.eventType,
          JSON.stringify(sanitized),
          event.ipAddress ?? null,
          event.requestId ?? null,
        ],
      );
    } catch (error) {
      console.error('[cloud-server] audit log failed', event.eventType, event.requestId, error);
    }
  }

  private sanitize(detail: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(detail)) {
      if (REDACT_KEYS.has(k.toLowerCase())) {
        result[k] = '[REDACTED]';
        continue;
      }
      result[k] = v;
    }
    return result;
  }
}
