import { randomUUID } from 'node:crypto';
import { AppError } from '@xiaohuang/domain-core';
import type { TenantClient } from '../tenant.js';
import type {
  ClassTenantRef,
  WorkspaceScope,
  WorkspaceScopeRequest,
} from '../../workspaces/scope.js';
import { toWorkspaceScope } from '../../workspaces/scope.js';

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

const WORKSPACE_COLUMNS =
  'workspace_id, account_id, class_id, subject_id, kind, deleted_at, revision, created_at, updated_at';

export function newWorkspaceId(): string {
  return `ws_${randomUUID().replace(/-/g, '')}`;
}

/**
 * Roster is not a SQL table — it is a sync resource under this workspace.
 * Uniqueness of (account, class, subject) / (account, subject) is the isolation key.
 */
export class WorkspaceRepository {
  constructor(private readonly db: TenantClient) {}

  async findById(workspaceId: string): Promise<WorkspaceRow | null> {
    const result = await this.db.query<WorkspaceRow>(
      `SELECT ${WORKSPACE_COLUMNS}
       FROM workspaces
       WHERE workspace_id = $1`,
      [workspaceId],
    );
    return result.rows[0] ?? null;
  }

  async requireActive(scope: Pick<WorkspaceScope, 'accountId' | 'workspaceId'>): Promise<WorkspaceRow> {
    const row = await this.findById(scope.workspaceId);
    if (!row || row.account_id !== scope.accountId || row.deleted_at) {
      throw new AppError('FORBIDDEN_WORKSPACE', '工作区不存在或无权访问');
    }
    return row;
  }

  async findPersonal(scope: Pick<WorkspaceScopeRequest, 'accountId' | 'subjectId'>): Promise<WorkspaceRow | null> {
    const result = await this.db.query<WorkspaceRow>(
      `SELECT ${WORKSPACE_COLUMNS}
       FROM workspaces
       WHERE account_id = $1 AND subject_id = $2 AND kind = 'personal' AND class_id IS NULL AND deleted_at IS NULL`,
      [scope.accountId, scope.subjectId],
    );
    return result.rows[0] ?? null;
  }

  async ensurePersonal(scope: WorkspaceScopeRequest): Promise<WorkspaceRow> {
    if (scope.mode !== 'authenticated') {
      throw new AppError('FORBIDDEN_WORKSPACE', '访客数据不会自动合并到云端');
    }
    if (scope.classId !== null) {
      throw new AppError('VALIDATION_SCHEMA', '个人工作区不能绑定班级');
    }

    const existing = await this.findPersonal(scope);
    if (existing) {
      return existing;
    }

    const workspaceId = newWorkspaceId();
    try {
      const inserted = await this.db.query<WorkspaceRow>(
        `INSERT INTO workspaces (workspace_id, account_id, class_id, subject_id, kind)
         VALUES ($1, $2, NULL, $3, 'personal')
         RETURNING ${WORKSPACE_COLUMNS}`,
        [workspaceId, scope.accountId, scope.subjectId],
      );
      return inserted.rows[0]!;
    } catch (error) {
      const pgError = error as { code?: string };
      if (pgError.code === '23505') {
        const raced = await this.findPersonal(scope);
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }

  async ensureClassWorkspace(scope: WorkspaceScopeRequest): Promise<WorkspaceRow> {
    if (scope.mode !== 'authenticated') {
      throw new AppError('FORBIDDEN_WORKSPACE', '访客数据不会自动合并到云端');
    }
    if (scope.classId === null) {
      throw new AppError('VALIDATION_SCHEMA', '班级工作区需要 classId');
    }

    const existing = await this.db.query<WorkspaceRow>(
      `SELECT ${WORKSPACE_COLUMNS}
       FROM workspaces
       WHERE account_id = $1 AND class_id = $2 AND subject_id = $3 AND kind = 'class' AND deleted_at IS NULL`,
      [scope.accountId, scope.classId, scope.subjectId],
    );
    if (existing.rows[0]) {
      return existing.rows[0];
    }

    const workspaceId = newWorkspaceId();
    try {
      const inserted = await this.db.query<WorkspaceRow>(
        `INSERT INTO workspaces (workspace_id, account_id, class_id, subject_id, kind)
         VALUES ($1, $2, $3, $4, 'class')
         RETURNING ${WORKSPACE_COLUMNS}`,
        [workspaceId, scope.accountId, scope.classId, scope.subjectId],
      );
      return inserted.rows[0]!;
    } catch (error) {
      const pgError = error as { code?: string };
      if (pgError.code === '23505') {
        const raced = await this.db.query<WorkspaceRow>(
          `SELECT ${WORKSPACE_COLUMNS}
           FROM workspaces
           WHERE account_id = $1 AND class_id = $2 AND subject_id = $3 AND kind = 'class' AND deleted_at IS NULL`,
          [scope.accountId, scope.classId, scope.subjectId],
        );
        if (raced.rows[0]) {
          return raced.rows[0];
        }
      }
      throw error;
    }
  }

  async resolveScope(scope: Pick<WorkspaceScope, 'accountId' | 'workspaceId'>): Promise<WorkspaceScope> {
    const row = await this.requireActive(scope);
    return toWorkspaceScope(row, 0);
  }

  async listForClass(ref: ClassTenantRef): Promise<WorkspaceRow[]> {
    const result = await this.db.query<WorkspaceRow>(
      `SELECT ${WORKSPACE_COLUMNS}
       FROM workspaces
       WHERE account_id = $1 AND class_id = $2 AND kind = 'class' AND deleted_at IS NULL
       ORDER BY subject_id ASC`,
      [ref.accountId, ref.classId],
    );
    return result.rows;
  }

  async tombstoneForClass(ref: ClassTenantRef): Promise<number> {
    const result = await this.db.query(
      `UPDATE workspaces
       SET deleted_at = NOW(), revision = revision + 1, updated_at = NOW()
       WHERE class_id = $1 AND account_id = $2 AND deleted_at IS NULL`,
      [ref.classId, ref.accountId],
    );
    return result.rowCount ?? 0;
  }

  async restoreForClass(ref: ClassTenantRef): Promise<number> {
    const result = await this.db.query(
      `UPDATE workspaces
       SET deleted_at = NULL, revision = revision + 1, updated_at = NOW()
       WHERE class_id = $1 AND account_id = $2 AND deleted_at IS NOT NULL`,
      [ref.classId, ref.accountId],
    );
    return result.rowCount ?? 0;
  }
}
