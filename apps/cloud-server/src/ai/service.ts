import type pg from 'pg';
import { AppError } from '@xiaohuang/domain-core';
import { encryptApiKey, decryptApiKey } from './encryption.js';
import { AiCredentialRepository } from '../db/repositories/ai-credential.js';

export type CredentialMetadata = {
  provider: string;
  model: string;
  configured: boolean;
  last4: string;
  updatedAt: string;
};

export type UsageSummary = {
  daily: { used: number; limit: number };
  monthly: { used: number; limit: number };
};

export type QuotaCheckResult = {
  allowed: boolean;
  daily: { used: number; limit: number };
  monthly: { used: number; limit: number };
};

export class AiService {
  private readonly repo: AiCredentialRepository;

  constructor(
    pool: pg.Pool,
    private readonly kek: Buffer,
    private readonly kekVersion: number,
  ) {
    this.repo = new AiCredentialRepository(pool);
  }

  async getCredentialMetadata(accountId: string): Promise<CredentialMetadata | null> {
    const row = await this.repo.getMetadata(accountId);
    if (!row) return null;
    return {
      provider: row.provider,
      model: row.model,
      configured: true,
      last4: row.last4,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async setCredential(
    accountId: string,
    provider: string,
    model: string,
    apiKey: string,
  ): Promise<CredentialMetadata> {
    const last4 = apiKey.slice(-4);
    const encrypted = encryptApiKey(apiKey, this.kek, this.kekVersion);
    const row = await this.repo.upsert(accountId, provider, model, encrypted, last4);
    return {
      provider: row.provider,
      model: row.model,
      configured: true,
      last4: row.last4,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async removeCredential(accountId: string): Promise<void> {
    await this.repo.remove(accountId);
  }

  async getUsageSummary(accountId: string): Promise<UsageSummary> {
    const check = await this.repo.checkQuota(accountId);
    return {
      daily: check.daily,
      monthly: check.monthly,
    };
  }

  async checkAndDecrementQuota(accountId: string): Promise<QuotaCheckResult> {
    const check = await this.repo.checkQuota(accountId);
    if (!check.allowed) {
      const code = check.daily.used >= check.daily.limit
        ? 'QUOTA_DAILY_EXCEEDED' as const
        : 'QUOTA_MONTHLY_EXCEEDED' as const;
      throw new AppError(code, '用量已达上限');
    }
    await this.repo.incrementUsage(accountId);
    return {
      allowed: true,
      daily: { used: check.daily.used + 1, limit: check.daily.limit },
      monthly: { used: check.monthly.used + 1, limit: check.monthly.limit },
    };
  }

  async decryptCredential(accountId: string): Promise<{ provider: string; model: string; apiKey: string }> {
    const row = await this.repo.getEncrypted(accountId);
    if (!row) {
      throw new AppError('CREDENTIAL_NOT_CONFIGURED', '未配置 AI 凭据');
    }
    const apiKey = decryptApiKey(
      {
        ciphertext: row.ciphertext,
        nonce: row.nonce,
        tag: row.tag,
        wrappedDek: row.wrapped_dek,
        kekVersion: row.kek_version,
      },
      this.kek,
    );
    return { provider: row.provider, model: row.model, apiKey };
  }
}
