import { randomUUID } from 'node:crypto';
import type { TenantClient } from '../tenant.js';

export type ClassRow = {
  class_id: string;
  account_id: string;
  name: string;
  archived: boolean;
  deleted_at: Date | null;
  revision: string;
  created_at: Date;
  updated_at: Date;
};

export function newClassId(): string {
  return `cls_${randomUUID().replace(/-/g, '')}`;
}

export class ClassRepository {
  constructor(private readonly db: TenantClient) {}

  async listActive(accountId: string): Promise<ClassRow[]> {
    const result = await this.db.query<ClassRow>(
      `SELECT class_id, account_id, name, archived, deleted_at, revision, created_at, updated_at
       FROM classes
       WHERE account_id = $1 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [accountId],
    );
    return result.rows;
  }

  async listTrash(accountId: string): Promise<ClassRow[]> {
    const result = await this.db.query<ClassRow>(
      `SELECT class_id, account_id, name, archived, deleted_at, revision, created_at, updated_at
       FROM classes
       WHERE account_id = $1
         AND deleted_at IS NOT NULL
         AND deleted_at > NOW() - INTERVAL '30 days'
       ORDER BY deleted_at DESC`,
      [accountId],
    );
    return result.rows;
  }

  async findById(accountId: string, classId: string): Promise<ClassRow | null> {
    const result = await this.db.query<ClassRow>(
      `SELECT class_id, account_id, name, archived, deleted_at, revision, created_at, updated_at
       FROM classes
       WHERE class_id = $1 AND account_id = $2`,
      [classId, accountId],
    );
    return result.rows[0] ?? null;
  }

  async create(accountId: string, name: string): Promise<ClassRow> {
    const classId = newClassId();
    const result = await this.db.query<ClassRow>(
      `INSERT INTO classes (class_id, account_id, name)
       VALUES ($1, $2, $3)
       RETURNING class_id, account_id, name, archived, deleted_at, revision, created_at, updated_at`,
      [classId, accountId, name],
    );
    return result.rows[0]!;
  }

  async update(
    classId: string,
    accountId: string,
    patch: { name?: string; archived?: boolean },
  ): Promise<ClassRow | null> {
    const sets: string[] = [];
    const values: unknown[] = [classId, accountId];
    let idx = 3;
    if (patch.name !== undefined) {
      sets.push(`name = $${idx++}`);
      values.push(patch.name);
    }
    if (patch.archived !== undefined) {
      sets.push(`archived = $${idx++}`);
      values.push(patch.archived);
    }
    if (sets.length === 0) {
      return this.findById(accountId, classId);
    }
    sets.push('revision = revision + 1');
    sets.push('updated_at = NOW()');
    const result = await this.db.query<ClassRow>(
      `UPDATE classes
       SET ${sets.join(', ')}
       WHERE class_id = $1 AND account_id = $2 AND deleted_at IS NULL
       RETURNING class_id, account_id, name, archived, deleted_at, revision, created_at, updated_at`,
      values,
    );
    return result.rows[0] ?? null;
  }

  /** Soft-delete; restore is allowed for 30 days, then cleanup may hard-delete. */
  async softDelete(classId: string, accountId: string): Promise<ClassRow | null> {
    const result = await this.db.query<ClassRow>(
      `UPDATE classes
       SET deleted_at = NOW(), revision = revision + 1, updated_at = NOW()
       WHERE class_id = $1 AND account_id = $2 AND deleted_at IS NULL
       RETURNING class_id, account_id, name, archived, deleted_at, revision, created_at, updated_at`,
      [classId, accountId],
    );
    return result.rows[0] ?? null;
  }

  async restore(classId: string, accountId: string): Promise<ClassRow | null> {
    const result = await this.db.query<ClassRow>(
      `UPDATE classes
       SET deleted_at = NULL, revision = revision + 1, updated_at = NOW()
       WHERE class_id = $1
         AND account_id = $2
         AND deleted_at IS NOT NULL
         AND deleted_at > NOW() - INTERVAL '30 days'
       RETURNING class_id, account_id, name, archived, deleted_at, revision, created_at, updated_at`,
      [classId, accountId],
    );
    return result.rows[0] ?? null;
  }
}
