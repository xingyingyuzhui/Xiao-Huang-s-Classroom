import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { DbQueryable } from '../db/repositories/account.js';

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(plain: string, storedHash: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

export class PasswordCredentialRepository {
  constructor(private readonly db: DbQueryable) {}

  async upsert(accountId: string, passwordHash: string): Promise<void> {
    await this.db.query(
      `INSERT INTO password_credentials (account_id, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (account_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()`,
      [accountId, passwordHash],
    );
  }

  async findHash(accountId: string): Promise<string | null> {
    const result = await this.db.query<{ password_hash: string }>(
      `SELECT password_hash FROM password_credentials WHERE account_id = $1`,
      [accountId],
    );
    return result.rows[0]?.password_hash ?? null;
  }
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function safeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
