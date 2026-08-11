import { AppError } from '@xiaohuang/domain-core';
import type pg from 'pg';
import { SessionRepository } from '../db/repositories/session.js';
import { deviceSessionSchema } from '@xiaohuang/contracts';

export class DeviceService {
  private readonly sessions: SessionRepository;

  constructor(pool: pg.Pool) {
    this.sessions = new SessionRepository(pool);
  }

  async listDevices(accountId: string, currentSessionId?: string) {
    const rows = await this.sessions.listActiveForAccount(accountId);
    return rows.map((row) =>
      deviceSessionSchema.parse({
        sessionId: row.session_id,
        deviceId: row.device_id,
        label: row.label,
        lastSeenAt: row.last_seen_at.toISOString(),
        createdAt: row.created_at.toISOString(),
        current: row.session_id === currentSessionId,
      }),
    );
  }

  async revokeDevice(accountId: string, sessionId: string, currentSessionId?: string) {
    const session = await this.sessions.findById(sessionId);
    if (!session || session.account_id !== accountId) {
      throw new AppError('FORBIDDEN_TENANT', '无权操作该设备会话');
    }
    if (session.status !== 'active') {
      return { revoked: false };
    }
    await this.sessions.revokeSession(sessionId, accountId);
    return { revoked: true, current: sessionId === currentSessionId };
  }
}
