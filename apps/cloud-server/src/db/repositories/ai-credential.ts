import type pg from 'pg';
import { withTenantTransaction } from '../tenant.js';
import type { EncryptedCredential } from '../../ai/encryption.js';

export type CredentialMetadataRow = {
  account_id: string;
  provider: string;
  model: string;
  last4: string;
  configured_at: Date;
  updated_at: Date;
};

export type EncryptedCredentialRow = CredentialMetadataRow & {
  ciphertext: Buffer;
  nonce: Buffer;
  tag: Buffer;
  wrapped_dek: Buffer;
  kek_version: number;
};

export type QuotaRow = {
  daily_limit: number;
  monthly_limit: number;
};

const DEFAULT_DAILY_LIMIT = 100;
const DEFAULT_MONTHLY_LIMIT = 2000;

export class AiCredentialRepository {
  constructor(private readonly pool: pg.Pool) {}

  async getMetadata(accountId: string): Promise<CredentialMetadataRow | null> {
    return withTenantTransaction(this.pool, accountId, async (client) => {
      const result = await client.query<CredentialMetadataRow>(
        `SELECT account_id, provider, model, last4, configured_at, updated_at
         FROM ai_credentials WHERE account_id = $1`,
        [accountId],
      );
      return result.rows[0] ?? null;
    });
  }

  async getEncrypted(accountId: string): Promise<EncryptedCredentialRow | null> {
    return withTenantTransaction(this.pool, accountId, async (client) => {
      const result = await client.query<EncryptedCredentialRow>(
        `SELECT account_id, provider, model, ciphertext, nonce, tag, wrapped_dek, kek_version, last4, configured_at, updated_at
         FROM ai_credentials WHERE account_id = $1`,
        [accountId],
      );
      return result.rows[0] ?? null;
    });
  }

  async upsert(
    accountId: string,
    provider: string,
    model: string,
    encrypted: EncryptedCredential,
    last4: string,
  ): Promise<CredentialMetadataRow> {
    return withTenantTransaction(this.pool, accountId, async (client) => {
      const result = await client.query<CredentialMetadataRow>(
        `INSERT INTO ai_credentials (account_id, provider, model, ciphertext, nonce, tag, wrapped_dek, kek_version, last4)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (account_id) DO UPDATE SET
           provider = EXCLUDED.provider,
           model = EXCLUDED.model,
           ciphertext = EXCLUDED.ciphertext,
           nonce = EXCLUDED.nonce,
           tag = EXCLUDED.tag,
           wrapped_dek = EXCLUDED.wrapped_dek,
           kek_version = EXCLUDED.kek_version,
           last4 = EXCLUDED.last4,
           updated_at = NOW()
         RETURNING account_id, provider, model, last4, configured_at, updated_at`,
        [
          accountId,
          provider,
          model,
          encrypted.ciphertext,
          encrypted.nonce,
          encrypted.tag,
          encrypted.wrappedDek,
          encrypted.kekVersion,
          last4,
        ],
      );
      return result.rows[0]!;
    });
  }

  async remove(accountId: string): Promise<void> {
    await withTenantTransaction(this.pool, accountId, async (client) => {
      await client.query('DELETE FROM ai_credentials WHERE account_id = $1', [accountId]);
    });
  }

  async getUsageToday(accountId: string): Promise<number> {
    return withTenantTransaction(this.pool, accountId, async (client) => {
      const result = await client.query<{ request_count: number }>(
        `SELECT request_count FROM ai_usage WHERE account_id = $1 AND usage_date = CURRENT_DATE`,
        [accountId],
      );
      return result.rows[0]?.request_count ?? 0;
    });
  }

  async getUsageMonth(accountId: string, yearMonth: string): Promise<number> {
    return withTenantTransaction(this.pool, accountId, async (client) => {
      const result = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(request_count), 0)::text AS total
         FROM ai_usage
         WHERE account_id = $1 AND to_char(usage_date, 'YYYY-MM') = $2`,
        [accountId, yearMonth],
      );
      return parseInt(result.rows[0]?.total ?? '0', 10);
    });
  }

  async incrementUsage(accountId: string): Promise<number> {
    return withTenantTransaction(this.pool, accountId, async (client) => {
      const result = await client.query<{ request_count: number }>(
        `INSERT INTO ai_usage (account_id, usage_date, request_count)
         VALUES ($1, CURRENT_DATE, 1)
         ON CONFLICT (account_id, usage_date)
         DO UPDATE SET request_count = ai_usage.request_count + 1
         RETURNING request_count`,
        [accountId],
      );
      return result.rows[0]!.request_count;
    });
  }

  async getQuota(accountId: string): Promise<QuotaRow> {
    return withTenantTransaction(this.pool, accountId, async (client) => {
      const result = await client.query<QuotaRow>(
        `SELECT daily_limit, monthly_limit FROM ai_quota WHERE account_id = $1`,
        [accountId],
      );
      return result.rows[0] ?? { daily_limit: DEFAULT_DAILY_LIMIT, monthly_limit: DEFAULT_MONTHLY_LIMIT };
    });
  }

  async checkQuota(accountId: string): Promise<{
    allowed: boolean;
    daily: { used: number; limit: number };
    monthly: { used: number; limit: number };
  }> {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [dailyUsed, monthlyUsed, quota] = await Promise.all([
      this.getUsageToday(accountId),
      this.getUsageMonth(accountId, yearMonth),
      this.getQuota(accountId),
    ]);
    const allowed = dailyUsed < quota.daily_limit && monthlyUsed < quota.monthly_limit;
    return {
      allowed,
      daily: { used: dailyUsed, limit: quota.daily_limit },
      monthly: { used: monthlyUsed, limit: quota.monthly_limit },
    };
  }
}
