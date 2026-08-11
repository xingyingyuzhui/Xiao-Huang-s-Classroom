import type { DbPool } from '../db/pool.js';

export type AuditEvent = {
  accountId: string | null;
  eventType: string;
  detail: Record<string, unknown>;
  ipAddress?: string;
  requestId?: string;
};

const REDACT_KEYS = new Set([
  'password',
  'token',
  'refreshtoken',
  'apikey',
  'key',
  'secret',
  'authorization',
  'cookie',
]);

export class AuditService {
  constructor(private readonly pool: DbPool) {}

  async log(event: AuditEvent): Promise<void> {
    const sanitized = this.sanitize(event.detail);
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
  }

  private sanitize(detail: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(detail)) {
      result[k] = REDACT_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : v;
    }
    return result;
  }
}
