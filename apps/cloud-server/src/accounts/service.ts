import { AppError } from '@xiaohuang/domain-core';
import type pg from 'pg';
import { AccountRepository } from '../db/repositories/account.js';
import { SessionRepository } from '../db/repositories/session.js';
import {
  PasswordCredentialRepository,
  hashPassword,
  verifyPassword,
} from '../auth/password.js';
import { AuditService } from '../audit/service.js';
import { AUDIT_EVENTS } from '../audit/events.js';

export class AccountService {
  private readonly accounts: AccountRepository;
  private readonly passwords: PasswordCredentialRepository;
  private readonly sessions: SessionRepository;
  private readonly audit: AuditService;

  constructor(pool: pg.Pool) {
    this.accounts = new AccountRepository(pool);
    this.passwords = new PasswordCredentialRepository(pool);
    this.sessions = new SessionRepository(pool);
    this.audit = new AuditService(pool);
  }

  async getProfile(accountId: string) {
    const account = await this.accounts.findById(accountId);
    if (!account) {
      throw new AppError('ACCOUNT_NOT_FOUND', '账户不存在');
    }
    return {
      accountId: account.account_id,
      displayName: account.display_name,
      avatarUrl: account.avatar_url,
      email: account.email,
      status: account.status === 'pending_deletion' ? 'pending_deletion' : 'active',
      pendingDeletionAt: account.pending_deletion_at?.toISOString() ?? null,
      createdAt: account.created_at.toISOString(),
      updatedAt: account.updated_at.toISOString(),
    };
  }

  async patchProfile(accountId: string, patch: { displayName?: string; avatarUrl?: string | null }) {
    const repoPatch: { displayName?: string; avatarUrl?: string | null } = {};
    if (patch.displayName !== undefined) repoPatch.displayName = patch.displayName;
    if (patch.avatarUrl !== undefined) repoPatch.avatarUrl = patch.avatarUrl;
    const updated = await this.accounts.updateProfile(accountId, repoPatch);
    if (!updated) {
      throw new AppError('ACCOUNT_NOT_FOUND', '账户不存在');
    }
    return this.getProfile(accountId);
  }

  async changePassword(accountId: string, currentPassword: string, newPassword: string) {
    const stored = await this.passwords.findHash(accountId);
    if (!stored || !(await verifyPassword(currentPassword, stored))) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', '当前密码不正确');
    }
    const nextHash = await hashPassword(newPassword);
    await this.passwords.upsert(accountId, nextHash);
    await this.sessions.revokeAllForAccount(accountId);
  }

  async requestDeletion(
    accountId: string,
    confirmDisplayName: string,
    currentPassword: string,
    auditContext?: { ipAddress?: string; requestId?: string },
  ) {
    const account = await this.accounts.findById(accountId);
    if (!account) {
      throw new AppError('ACCOUNT_NOT_FOUND', '账户不存在');
    }
    if (account.status !== 'active') {
      throw new AppError('VALIDATION_SCHEMA', '账户已处于删除流程中');
    }
    if (account.display_name !== confirmDisplayName) {
      throw new AppError('VALIDATION_SCHEMA', '确认名称与账户显示名不一致');
    }
    const stored = await this.passwords.findHash(accountId);
    if (!stored || !(await verifyPassword(currentPassword, stored))) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', '当前密码不正确');
    }

    const pendingAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const updated = await this.accounts.requestDeletion(accountId, pendingAt);
    if (!updated) {
      throw new AppError('VALIDATION_SCHEMA', '账户已处于删除流程中');
    }
    await this.sessions.revokeAllForAccount(accountId);
    await this.audit.log({
      accountId,
      eventType: AUDIT_EVENTS.ACCOUNT_DELETION_REQUESTED,
      detail: { pendingDeletionAt: pendingAt.toISOString() },
      ipAddress: auditContext?.ipAddress,
      requestId: auditContext?.requestId,
    });
    return {
      accountId,
      pendingDeletionAt: pendingAt.toISOString(),
    };
  }

  async cancelDeletion(
    accountId: string,
    auditContext?: { ipAddress?: string; requestId?: string },
  ) {
    const updated = await this.accounts.cancelDeletion(accountId);
    if (!updated) {
      throw new AppError('VALIDATION_SCHEMA', '账户未处于待删除状态');
    }
    await this.audit.log({
      accountId,
      eventType: AUDIT_EVENTS.ACCOUNT_DELETION_CANCELLED,
      detail: {},
      ipAddress: auditContext?.ipAddress,
      requestId: auditContext?.requestId,
    });
    return { accountId, restored: true as const };
  }
}
