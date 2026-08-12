import { randomUUID } from 'node:crypto';
import type pg from 'pg';

export type DbQueryable = Pick<pg.Pool, 'query'>;

export type AccountRow = {
  account_id: string;
  display_name: string;
  avatar_url: string | null;
  email: string | null;
  status: 'active' | 'pending_deletion' | 'deleted';
  pending_deletion_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type AccountCreateInput = {
  displayName: string;
  avatarUrl?: string | null;
  email?: string | null;
};

export function newAccountId(): string {
  return `acct_${randomUUID().replace(/-/g, '')}`;
}

export class AccountRepository {
  constructor(private readonly db: DbQueryable) {}

  async findById(accountId: string): Promise<AccountRow | null> {
    const result = await this.db.query<AccountRow>(
      `SELECT account_id, display_name, avatar_url, email, status, pending_deletion_at, created_at, updated_at
       FROM accounts WHERE account_id = $1`,
      [accountId],
    );
    return result.rows[0] ?? null;
  }

  async create(input: AccountCreateInput): Promise<AccountRow> {
    const accountId = newAccountId();
    const result = await this.db.query<AccountRow>(
      `INSERT INTO accounts (account_id, display_name, avatar_url, email)
       VALUES ($1, $2, $3, $4)
       RETURNING account_id, display_name, avatar_url, email, status, pending_deletion_at, created_at, updated_at`,
      [accountId, input.displayName, input.avatarUrl ?? null, input.email ?? null],
    );
    return result.rows[0]!;
  }

  async updateProfile(
    accountId: string,
    patch: { displayName?: string; avatarUrl?: string | null },
  ): Promise<AccountRow | null> {
    const sets: string[] = [];
    const values: unknown[] = [accountId];
    if (patch.displayName !== undefined) {
      values.push(patch.displayName);
      sets.push(`display_name = $${values.length}`);
    }
    if (patch.avatarUrl !== undefined) {
      values.push(patch.avatarUrl);
      sets.push(`avatar_url = $${values.length}`);
    }
    if (sets.length === 0) {
      return this.findById(accountId);
    }
    sets.push('updated_at = NOW()');
    const result = await this.db.query<AccountRow>(
      `UPDATE accounts SET ${sets.join(', ')}
       WHERE account_id = $1
       RETURNING account_id, display_name, avatar_url, email, status, pending_deletion_at, created_at, updated_at`,
      values,
    );
    return result.rows[0] ?? null;
  }

  async requestDeletion(accountId: string, pendingAt: Date): Promise<AccountRow | null> {
    const result = await this.db.query<AccountRow>(
      `UPDATE accounts
       SET status = 'pending_deletion', pending_deletion_at = $2, updated_at = NOW()
       WHERE account_id = $1 AND status = 'active'
       RETURNING account_id, display_name, avatar_url, email, status, pending_deletion_at, created_at, updated_at`,
      [accountId, pendingAt],
    );
    return result.rows[0] ?? null;
  }

  async cancelDeletion(accountId: string): Promise<AccountRow | null> {
    const result = await this.db.query<AccountRow>(
      `UPDATE accounts
       SET status = 'active', pending_deletion_at = NULL, updated_at = NOW()
       WHERE account_id = $1 AND status = 'pending_deletion'
       RETURNING account_id, display_name, avatar_url, email, status, pending_deletion_at, created_at, updated_at`,
      [accountId],
    );
    return result.rows[0] ?? null;
  }
}
