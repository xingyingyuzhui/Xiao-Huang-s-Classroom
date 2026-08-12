import { randomUUID } from 'node:crypto';
import { AppError } from '@xiaohuang/domain-core';
import type pg from 'pg';
import type { CloudConfig } from '../config.js';
import { AccountRepository } from '../db/repositories/account.js';
import { IdentityRepository, normalizeUsername } from '../db/repositories/identity.js';
import {
  SessionRepository,
  isSessionActiveAndUnexpired,
  newTokenFamilyId,
  sessionExpiresAt,
  type SessionRow,
} from '../db/repositories/session.js';
import {
  PasswordCredentialRepository,
  generateRefreshToken,
  hashPassword,
  hashRefreshToken,
  verifyPassword,
} from './password.js';
import { signAccessToken } from './tokens.js';

const INVALID_CREDENTIALS_MESSAGE = '用户名或密码不正确';
const KNOWN_DEVICE_LABELS = ['Web', 'Desktop', 'Mobile'] as const;

let dummyPasswordHash: Promise<string> | null = null;

async function dummyPasswordHashValue(): Promise<string> {
  if (!dummyPasswordHash) {
    dummyPasswordHash = hashPassword('__timing_dummy__');
  }
  return dummyPasswordHash;
}

export function normalizeDeviceLabel(raw: string): (typeof KNOWN_DEVICE_LABELS)[number] {
  const trimmed = raw.trim().slice(0, 32);
  const exact = KNOWN_DEVICE_LABELS.find((label) => label.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;
  const lower = trimmed.toLowerCase();
  if (/(desktop|electron)/i.test(lower)) return 'Desktop';
  if (/(mobile|android|ios|iphone|ipad)/i.test(lower)) return 'Mobile';
  return 'Web';
}

export type AuthSessionPayload = {
  accountId: string;
  sessionId: string;
  deviceId: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshExpiresAt: string;
};

export class AuthService {
  private readonly accounts: AccountRepository;
  private readonly identities: IdentityRepository;
  private readonly sessions: SessionRepository;
  private readonly passwords: PasswordCredentialRepository;

  constructor(
    private readonly pool: pg.Pool,
    private readonly config: CloudConfig,
  ) {
    this.accounts = new AccountRepository(pool);
    this.identities = new IdentityRepository(pool);
    this.sessions = new SessionRepository(pool);
    this.passwords = new PasswordCredentialRepository(pool);
  }

  async register(input: {
    username: string;
    password: string;
    displayName: string;
    inviteCode?: string;
    deviceLabel: string;
    deviceId?: string;
  }): Promise<{ session: AuthSessionPayload; refreshToken: string }> {
    if (this.config.registrationMode === 'closed') {
      throw new AppError('AUTH_REGISTRATION_CLOSED', '当前未开放注册');
    }
    if (this.config.registrationMode === 'invite') {
      // Invite store / hash / expiry is not implemented; reject all attempts.
      throw new AppError('AUTH_FEATURE_DISABLED', '邀请注册暂不可用');
    }

    const normalized = normalizeUsername(input.username);
    const existing = await this.identities.findByKindAndValue('username', normalized);
    if (existing) {
      throw new AppError('VALIDATION_SCHEMA', '用户名已被使用');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const accountRepo = new AccountRepository(client);
      const identityRepo = new IdentityRepository(client);
      const passwordRepo = new PasswordCredentialRepository(client);

      const account = await accountRepo.create({ displayName: input.displayName });
      await identityRepo.createUsernameIdentity(account.account_id, input.username);
      const passwordHash = await hashPassword(input.password);
      await passwordRepo.upsert(account.account_id, passwordHash);
      await client.query('COMMIT');

      return this.createSessionForAccount({
        accountId: account.account_id,
        deviceId: input.deviceId ?? `dev_${randomUUID().replace(/-/g, '')}`,
        deviceLabel: input.deviceLabel,
        scope: 'full',
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async login(input: {
    username: string;
    password: string;
    deviceLabel: string;
    deviceId?: string;
  }): Promise<{ session: AuthSessionPayload; refreshToken: string }> {
    const normalized = normalizeUsername(input.username);
    const identity = await this.identities.findByKindAndValue('username', normalized);
    if (!identity) {
      await verifyPassword(input.password, await dummyPasswordHashValue());
      throw new AppError('AUTH_INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE);
    }

    const account = await this.accounts.findById(identity.account_id);
    if (!account || account.status === 'deleted') {
      await verifyPassword(input.password, await dummyPasswordHashValue());
      throw new AppError('AUTH_INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE);
    }

    const storedHash = await this.passwords.findHash(identity.account_id);
    if (!storedHash || !(await verifyPassword(input.password, storedHash))) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE);
    }

    const scope = account.status === 'pending_deletion' ? 'account:restore' : 'full';
    const deviceId = input.deviceId ?? `dev_${randomUUID().replace(/-/g, '')}`;

    if (scope === 'account:restore') {
      await this.sessions.revokeAllForAccount(account.account_id);
    }

    return this.createSessionForAccount({
      accountId: account.account_id,
      deviceId,
      deviceLabel: input.deviceLabel,
      scope,
    });
  }

  async refresh(refreshToken: string, deviceId: string): Promise<{
    session: AuthSessionPayload;
    refreshToken: string;
  }> {
    const hash = hashRefreshToken(refreshToken);
    const session = await this.sessions.findByRefreshHash(hash);
    if (!session) {
      const reused = await this.sessions.findByReplacedRefreshHash(hash);
      if (reused) {
        await this.sessions.revokeFamily(reused.token_family_id);
        throw new AppError('AUTH_REFRESH_REUSE', '会话已失效，请重新登录');
      }
      throw new AppError('AUTH_SESSION_EXPIRED', '会话已过期，请重新登录');
    }

    if (!isSessionActiveAndUnexpired(session)) {
      await this.sessions.revokeSession(session.session_id, session.account_id);
      throw new AppError('AUTH_SESSION_EXPIRED', '会话已过期，请重新登录');
    }

    if (session.device_id !== deviceId) {
      throw new AppError('AUTH_SESSION_EXPIRED', '会话已过期，请重新登录');
    }

    const account = await this.accounts.findById(session.account_id);
    if (!account || account.status === 'deleted') {
      await this.sessions.revokeSession(session.session_id, session.account_id);
      throw new AppError('AUTH_SESSION_EXPIRED', '会话已过期，请重新登录');
    }

    const scope = account.status === 'pending_deletion' ? 'account:restore' : 'full';
    const newRefresh = generateRefreshToken();
    const newHash = hashRefreshToken(newRefresh);
    const rotated = await this.sessions.rotateRefreshToken(
      session.session_id,
      hash,
      newHash,
    );
    if (!rotated) {
      throw new AppError('AUTH_SESSION_EXPIRED', '会话已过期，请重新登录');
    }

    return this.issueTokens(rotated, scope, newRefresh);
  }

  async logout(input: {
    accountId?: string;
    sessionId?: string;
    refreshToken?: string;
    allDevices?: boolean;
  }): Promise<void> {
    if (input.allDevices) {
      let accountId = input.accountId;
      if (!accountId && input.refreshToken) {
        const session = await this.sessions.findByRefreshHash(hashRefreshToken(input.refreshToken));
        accountId = session?.account_id;
      }
      if (accountId) {
        await this.sessions.revokeAllForAccount(accountId);
      }
      return;
    }
    if (input.accountId && input.sessionId) {
      await this.sessions.revokeSession(input.sessionId, input.accountId);
      return;
    }
    if (input.refreshToken) {
      const session = await this.sessions.findByRefreshHash(hashRefreshToken(input.refreshToken));
      if (session) {
        await this.sessions.revokeSession(session.session_id, session.account_id);
      }
    }
  }

  private async createSessionForAccount(input: {
    accountId: string;
    deviceId: string;
    deviceLabel: string;
    scope: 'full' | 'account:restore';
  }): Promise<{ session: AuthSessionPayload; refreshToken: string }> {
    const refreshToken = generateRefreshToken();
    const refreshHash = hashRefreshToken(refreshToken);
    const familyId = newTokenFamilyId();
    const expiresAt = sessionExpiresAt();
    const label = normalizeDeviceLabel(input.deviceLabel);

    const client = await this.pool.connect();
    let row: SessionRow;
    try {
      await client.query('BEGIN');
      const sessions = new SessionRepository(client);
      await sessions.revokeActiveForAccountDevice(input.accountId, input.deviceId);
      row = await sessions.createSession({
        accountId: input.accountId,
        deviceId: input.deviceId,
        label,
        refreshTokenHash: refreshHash,
        tokenFamilyId: familyId,
        expiresAt,
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return this.issueTokens(row, input.scope, refreshToken);
  }

  private async issueTokens(
    session: SessionRow,
    scope: 'full' | 'account:restore',
    refreshToken: string,
  ): Promise<{ session: AuthSessionPayload; refreshToken: string }> {
    const { token, expiresAt } = await signAccessToken(this.config, {
      accountId: session.account_id,
      sessionId: session.session_id,
      deviceId: session.device_id,
      scope,
    });

    return {
      session: {
        accountId: session.account_id,
        sessionId: session.session_id,
        deviceId: session.device_id,
        accessToken: token,
        accessTokenExpiresAt: expiresAt.toISOString(),
        refreshExpiresAt: session.expires_at.toISOString(),
      },
      refreshToken,
    };
  }
}
