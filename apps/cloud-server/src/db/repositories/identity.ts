import { randomUUID } from 'node:crypto';
import type { DbQueryable } from './account.js';

export type IdentityKind = 'username' | 'email' | 'wechat';

export type IdentityRow = {
  identity_id: string;
  account_id: string;
  kind: IdentityKind;
  normalized_value: string;
  verified_at: Date | null;
  created_at: Date;
};

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function newIdentityId(): string {
  return `id_${randomUUID().replace(/-/g, '')}`;
}

export class IdentityRepository {
  constructor(private readonly db: DbQueryable) {}

  async findByKindAndValue(kind: IdentityKind, normalizedValue: string): Promise<IdentityRow | null> {
    const result = await this.db.query<IdentityRow>(
      `SELECT identity_id, account_id, kind, normalized_value, verified_at, created_at
       FROM account_identities WHERE kind = $1 AND normalized_value = $2`,
      [kind, normalizedValue],
    );
    return result.rows[0] ?? null;
  }

  async createUsernameIdentity(accountId: string, username: string): Promise<IdentityRow> {
    const identityId = newIdentityId();
    const normalized = normalizeUsername(username);
    const result = await this.db.query<IdentityRow>(
      `INSERT INTO account_identities (identity_id, account_id, kind, normalized_value, verified_at)
       VALUES ($1, $2, 'username', $3, NOW())
       RETURNING identity_id, account_id, kind, normalized_value, verified_at, created_at`,
      [identityId, accountId, normalized],
    );
    return result.rows[0]!;
  }
}
