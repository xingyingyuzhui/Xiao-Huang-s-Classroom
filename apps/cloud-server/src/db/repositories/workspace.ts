import { randomUUID } from 'node:crypto';
import type { TenantClient } from '../tenant.js';

export type WorkspaceRow = {
  workspace_id: string;
  account_id: string;
  class_id: string | null;
  subject_id: string;
  kind: 'personal' | 'class';
  deleted_at: Date | null;
  revision: string;
  created_at: Date;
  updated_at: Date;
};

export function newWorkspaceId(): string {
  return `ws_${randomUUID().replace(/-/g, '')}`;
}

export class WorkspaceRepository {
  constructor(private readonly db: TenantClient) {}

  async findPersonal(accountId: string, subjectId: string): Promise<WorkspaceRow | null> {
    const result = await this.db.query<WorkspaceRow>(
      `SELECT workspace_id, account_id, class_id, subject_id, kind, deleted_at, revision, created_at, updated_at
       FROM workspaces
       WHERE account_id = $1 AND subject_id = $2 AND kind = 'personal' AND class_id IS NULL AND deleted_at IS NULL`,
      [accountId, subjectId],
    );
    return result.rows[0] ?? null;
  }

  async ensurePersonal(accountId: string, subjectId: string): Promise<WorkspaceRow> {
    const existing = await this.findPersonal(accountId, subjectId);
    if (existing) {
      return existing;
    }

    const workspaceId = newWorkspaceId();
    try {
      const inserted = await this.db.query<WorkspaceRow>(
        `INSERT INTO workspaces (workspace_id, account_id, class_id, subject_id, kind)
         VALUES ($1, $2, NULL, $3, 'personal')
         RETURNING workspace_id, account_id, class_id, subject_id, kind, deleted_at, revision, created_at, updated_at`,
        [workspaceId, accountId, subjectId],
      );
      return inserted.rows[0]!;
    } catch (error) {
      const pgError = error as { code?: string };
      if (pgError.code === '23505') {
        const raced = await this.findPersonal(accountId, subjectId);
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }

  async ensureClassWorkspace(
    accountId: string,
    classId: string,
    subjectId: string,
  ): Promise<WorkspaceRow> {
    const existing = await this.db.query<WorkspaceRow>(
      `SELECT workspace_id, account_id, class_id, subject_id, kind, deleted_at, revision, created_at, updated_at
       FROM workspaces
       WHERE account_id = $1 AND class_id = $2 AND subject_id = $3 AND kind = 'class' AND deleted_at IS NULL`,
      [accountId, classId, subjectId],
    );
    if (existing.rows[0]) {
      return existing.rows[0];
    }

    const workspaceId = newWorkspaceId();
    try {
      const inserted = await this.db.query<WorkspaceRow>(
        `INSERT INTO workspaces (workspace_id, account_id, class_id, subject_id, kind)
         VALUES ($1, $2, $3, $4, 'class')
         RETURNING workspace_id, account_id, class_id, subject_id, kind, deleted_at, revision, created_at, updated_at`,
        [workspaceId, accountId, classId, subjectId],
      );
      return inserted.rows[0]!;
    } catch (error) {
      const pgError = error as { code?: string };
      if (pgError.code === '23505') {
        const raced = await this.db.query<WorkspaceRow>(
          `SELECT workspace_id, account_id, class_id, subject_id, kind, deleted_at, revision, created_at, updated_at
           FROM workspaces
           WHERE account_id = $1 AND class_id = $2 AND subject_id = $3 AND kind = 'class' AND deleted_at IS NULL`,
          [accountId, classId, subjectId],
        );
        if (raced.rows[0]) {
          return raced.rows[0];
        }
      }
      throw error;
    }
  }

  async listForClass(accountId: string, classId: string): Promise<WorkspaceRow[]> {
    const result = await this.db.query<WorkspaceRow>(
      `SELECT workspace_id, account_id, class_id, subject_id, kind, deleted_at, revision, created_at, updated_at
       FROM workspaces
       WHERE account_id = $1 AND class_id = $2 AND kind = 'class' AND deleted_at IS NULL
       ORDER BY subject_id ASC`,
      [accountId, classId],
    );
    return result.rows;
  }

  async tombstoneForClass(classId: string, accountId: string): Promise<number> {
    const result = await this.db.query(
      `UPDATE workspaces
       SET deleted_at = NOW(), revision = revision + 1, updated_at = NOW()
       WHERE class_id = $1 AND account_id = $2 AND deleted_at IS NULL`,
      [classId, accountId],
    );
    return result.rowCount ?? 0;
  }

  async restoreForClass(classId: string, accountId: string): Promise<number> {
    const result = await this.db.query(
      `UPDATE workspaces
       SET deleted_at = NULL, revision = revision + 1, updated_at = NOW()
       WHERE class_id = $1 AND account_id = $2 AND deleted_at IS NOT NULL`,
      [classId, accountId],
    );
    return result.rowCount ?? 0;
  }
}
