import type pg from 'pg';
import { AppError } from '@xiaohuang/domain-core';
import { withTenantTransaction } from '../db/tenant.js';

export type QuotaSnapshot = {
  daily: { used: number; limit: number };
  monthly: { used: number; limit: number };
};

/**
 * Atomically reserve one AI request.
 * Serializes on ai_quota FOR UPDATE, then UPDATE ai_usage … WHERE used < limit RETURNING.
 */
export async function reserveQuota(pool: pg.Pool, accountId: string): Promise<QuotaSnapshot> {
  return withTenantTransaction(pool, accountId, async (client) => {
    await client.query(
      `INSERT INTO ai_quota (account_id) VALUES ($1) ON CONFLICT (account_id) DO NOTHING`,
      [accountId],
    );
    const quotaRes = await client.query<{ daily_limit: number; monthly_limit: number }>(
      `SELECT daily_limit, monthly_limit FROM ai_quota WHERE account_id = $1 FOR UPDATE`,
      [accountId],
    );
    const quota = quotaRes.rows[0];
    if (!quota) {
      throw new AppError('INTERNAL_UNKNOWN', '用量配额初始化失败');
    }

    await client.query(
      `INSERT INTO ai_usage (account_id, usage_date, request_count)
       VALUES ($1, CURRENT_DATE, 0)
       ON CONFLICT (account_id, usage_date) DO NOTHING`,
      [accountId],
    );

    const dailyRes = await client.query<{ request_count: number }>(
      `UPDATE ai_usage
       SET request_count = request_count + 1
       WHERE account_id = $1
         AND usage_date = CURRENT_DATE
         AND request_count < $2
       RETURNING request_count`,
      [accountId, quota.daily_limit],
    );
    const dailyUsed = dailyRes.rows[0]?.request_count;
    if (dailyUsed == null) {
      throw new AppError('QUOTA_DAILY_EXCEEDED', '今日用量已达上限');
    }

    const monthRes = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(request_count), 0)::text AS total
       FROM ai_usage
       WHERE account_id = $1
         AND date_trunc('month', usage_date) = date_trunc('month', CURRENT_DATE::timestamp)`,
      [accountId],
    );
    const monthlyUsed = parseInt(monthRes.rows[0]?.total ?? '0', 10);
    if (monthlyUsed > quota.monthly_limit) {
      await client.query(
        `UPDATE ai_usage
         SET request_count = GREATEST(request_count - 1, 0)
         WHERE account_id = $1 AND usage_date = CURRENT_DATE`,
        [accountId],
      );
      throw new AppError('QUOTA_MONTHLY_EXCEEDED', '本月用量已达上限');
    }

    return {
      daily: { used: dailyUsed, limit: quota.daily_limit },
      monthly: { used: monthlyUsed, limit: quota.monthly_limit },
    };
  });
}

export async function releaseQuota(pool: pg.Pool, accountId: string): Promise<void> {
  await withTenantTransaction(pool, accountId, async (client) => {
    await client.query(
      `UPDATE ai_usage
       SET request_count = GREATEST(request_count - 1, 0)
       WHERE account_id = $1 AND usage_date = CURRENT_DATE`,
      [accountId],
    );
  });
}
