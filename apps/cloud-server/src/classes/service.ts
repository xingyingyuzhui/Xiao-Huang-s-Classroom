import { AppError } from '@xiaohuang/domain-core';
import { classRecordSchema, type ClassRecord } from '@xiaohuang/contracts';
import type pg from 'pg';
import { AuditService } from '../audit/service.js';
import { AUDIT_EVENTS } from '../audit/events.js';
import { ClassRepository, type ClassRow } from '../db/repositories/class.js';
import { WorkspaceRepository } from '../db/repositories/workspace.js';
import { withTenantTransaction } from '../db/tenant.js';
import {
  authenticatedWorkspaceRequest,
  toWorkspaceScope,
  type WorkspaceScope,
  type WorkspaceScopeRequest,
} from '../workspaces/scope.js';

export type ClassAuditContext = {
  requestId?: string | undefined;
  ipAddress?: string | undefined;
};

function toClassRecord(row: ClassRow): ClassRecord {
  return classRecordSchema.parse({
    id: row.class_id,
    accountId: row.account_id,
    name: row.name,
    archived: row.archived,
    deletedAt: row.deleted_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function toWorkspaceDto(scope: WorkspaceScope) {
  return {
    id: scope.workspaceId,
    classId: scope.classId,
    accountId: scope.accountId,
    subjectId: scope.subjectId,
    kind: scope.classId ? ('class' as const) : ('personal' as const),
  };
}

export class ClassService {
  private readonly audit: AuditService;

  constructor(private readonly pool: pg.Pool) {
    this.audit = new AuditService(pool);
  }

  async listClasses(accountId: string): Promise<ClassRecord[]> {
    return withTenantTransaction(this.pool, accountId, async (client) => {
      const classes = new ClassRepository(client);
      const rows = await classes.listActive(accountId);
      return rows.map(toClassRecord);
    });
  }

  async listTrash(accountId: string): Promise<ClassRecord[]> {
    return withTenantTransaction(this.pool, accountId, async (client) => {
      const classes = new ClassRepository(client);
      const rows = await classes.listTrash(accountId);
      return rows.map(toClassRecord);
    });
  }

  async createClass(accountId: string, name: string): Promise<ClassRecord> {
    return withTenantTransaction(this.pool, accountId, async (client) => {
      const classes = new ClassRepository(client);
      const row = await classes.create(accountId, name);
      return toClassRecord(row);
    });
  }

  async patchClass(
    accountId: string,
    classId: string,
    patch: { name?: string; archived?: boolean },
  ): Promise<ClassRecord> {
    return withTenantTransaction(this.pool, accountId, async (client) => {
      const classes = new ClassRepository(client);
      const existing = await classes.findById(accountId, classId);
      if (!existing) {
        throw new AppError('CLASS_NOT_FOUND', '班级不存在');
      }
      if (existing.deleted_at) {
        throw new AppError('CLASS_TRASHED', '班级已在废纸篓中');
      }
      const row = await classes.update(classId, accountId, patch);
      if (!row) {
        throw new AppError('CLASS_NOT_FOUND', '班级不存在');
      }
      return toClassRecord(row);
    });
  }

  async copyClass(
    accountId: string,
    sourceClassId: string,
    input: { name: string; includeProgress?: boolean },
  ): Promise<ClassRecord> {
    return withTenantTransaction(this.pool, accountId, async (client) => {
      const classes = new ClassRepository(client);
      const workspaces = new WorkspaceRepository(client);

      const source = await classes.findById(accountId, sourceClassId);
      if (!source) {
        throw new AppError('CLASS_NOT_FOUND', '班级不存在');
      }
      if (source.deleted_at) {
        throw new AppError('CLASS_TRASHED', '班级已在废纸篓中');
      }

      const created = await classes.create(accountId, input.name);
      const sourceWorkspaces = await workspaces.listForClass({
        accountId,
        classId: sourceClassId,
      });
      for (const ws of sourceWorkspaces) {
        await workspaces.ensureClassWorkspace(
          authenticatedWorkspaceRequest(accountId, {
            classId: created.class_id,
            subjectId: ws.subject_id,
          }),
        );
      }

      if (input.includeProgress) {
        // Sync resource duplication lands in Task 7; copy preserves class shells only for now.
      }

      return toClassRecord(created);
    });
  }

  async deleteClass(
    accountId: string,
    classId: string,
    auditCtx: ClassAuditContext = {},
  ): Promise<ClassRecord> {
    const record = await withTenantTransaction(this.pool, accountId, async (client) => {
      const classes = new ClassRepository(client);
      const workspaces = new WorkspaceRepository(client);

      const existing = await classes.findById(accountId, classId);
      if (!existing) {
        throw new AppError('CLASS_NOT_FOUND', '班级不存在');
      }
      if (existing.deleted_at) {
        throw new AppError('CLASS_TRASHED', '班级已在废纸篓中');
      }

      await workspaces.tombstoneForClass({ accountId, classId });
      const row = await classes.softDelete(classId, accountId);
      if (!row) {
        throw new AppError('CLASS_NOT_FOUND', '班级不存在');
      }
      return toClassRecord(row);
    });

    await this.audit.log({
      accountId,
      eventType: AUDIT_EVENTS.CLASS_DELETE,
      detail: { classId },
      requestId: auditCtx.requestId,
      ipAddress: auditCtx.ipAddress,
    });
    return record;
  }

  async restoreClass(
    accountId: string,
    classId: string,
    auditCtx: ClassAuditContext = {},
  ): Promise<ClassRecord> {
    const record = await withTenantTransaction(this.pool, accountId, async (client) => {
      const classes = new ClassRepository(client);
      const workspaces = new WorkspaceRepository(client);

      const existing = await classes.findById(accountId, classId);
      if (!existing) {
        throw new AppError('CLASS_NOT_FOUND', '班级不存在');
      }
      if (!existing.deleted_at) {
        throw new AppError('CLASS_NOT_FOUND', '班级不在废纸篓中');
      }

      const row = await classes.restore(classId, accountId);
      if (!row) {
        throw new AppError('CLASS_NOT_FOUND', '班级无法恢复');
      }
      await workspaces.restoreForClass({ accountId, classId });
      return toClassRecord(row);
    });

    await this.audit.log({
      accountId,
      eventType: AUDIT_EVENTS.CLASS_RESTORE,
      detail: { classId },
      requestId: auditCtx.requestId,
      ipAddress: auditCtx.ipAddress,
    });
    return record;
  }

  /**
   * Login without a class resolves the personal subject workspace.
   * Guest → cloud copy stays explicit; this never auto-merges guest data.
   */
  async ensurePersonalWorkspace(accountId: string, subjectId: string) {
    return this.ensureWorkspace(
      authenticatedWorkspaceRequest(accountId, { classId: null, subjectId }),
    );
  }

  async ensureClassWorkspace(accountId: string, classId: string, subjectId: string) {
    return this.ensureWorkspace(
      authenticatedWorkspaceRequest(accountId, { classId, subjectId }),
    );
  }

  async ensureWorkspace(scope: WorkspaceScopeRequest) {
    return withTenantTransaction(this.pool, scope.accountId, async (client) => {
      const workspaces = new WorkspaceRepository(client);
      if (scope.classId) {
        const classes = new ClassRepository(client);
        const existing = await classes.findById(scope.accountId, scope.classId);
        if (!existing) {
          throw new AppError('CLASS_NOT_FOUND', '班级不存在');
        }
        if (existing.deleted_at) {
          throw new AppError('CLASS_TRASHED', '班级已在废纸篓中');
        }
        const row = await workspaces.ensureClassWorkspace(scope);
        return toWorkspaceDto(toWorkspaceScope(row, scope.generation));
      }
      const row = await workspaces.ensurePersonal(scope);
      return toWorkspaceDto(toWorkspaceScope(row, scope.generation));
    });
  }
}
