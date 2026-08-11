import { AppError } from '@xiaohuang/domain-core';
import type pg from 'pg';
import { AccountRepository } from '../db/repositories/account.js';
import { SessionRepository } from '../db/repositories/session.js';
import {
  PasswordCredentialRepository,
  hashPassword,
  verifyPassword,
} from '../auth/password.js';

export class AccountService {
  private readonly accounts: AccountRepository;
  private readonly passwords: PasswordCredentialRepository;
  private readonly sessions: SessionRepository;

  constructor(pool: pg.Pool) {
    this.accounts = new AccountRepository(pool);
    this.passwords = new PasswordCredentialRepository(pool);
    this.sessions = new SessionRepository(pool);
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

  async requestDeletion(accountId: string, confirmDisplayName: string) {
    const account = await this.accounts.findById(accountId);
    if (!account) {
      throw new AppError('ACCOUNT_NOT_FOUND', '账户不存在');
    }
    if (account.display_name !== confirmDisplayName) {
      throw new AppError('VALIDATION_SCHEMA', '确认名称与账户显示名不一致');
    }
    const pendingAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const updated = await this.accounts.requestDeletion(accountId, pendingAt);
    if (!updated) {
      throw new AppError('VALIDATION_SCHEMA', '账户已处于删除流程中');
    }
    await this.sessions.revokeAllForAccount(accountId);
    return {
      accountId,
      pendingDeletionAt: pendingAt.toISOString(),
    };
  }

  async cancelDeletion(accountId: string) {
    const updated = await this.accounts.cancelDeletion(accountId);
    if (!updated) {
      throw new AppError('VALIDATION_SCHEMA', '账户未处于待删除状态');
    }
    return { accountId, restored: true };
  }
}
