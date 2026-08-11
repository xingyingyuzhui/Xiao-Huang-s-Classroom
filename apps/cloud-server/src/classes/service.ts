import { AppError } from '@xiaohuang/domain-core';
import { classRecordSchema, type ClassRecord } from '@xiaohuang/contracts';
import type pg from 'pg';
import { ClassRepository, type ClassRow } from '../db/repositories/class.js';
import { WorkspaceRepository } from '../db/repositories/workspace.js';
import { withTenantTransaction } from '../db/tenant.js';

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

export class ClassService {
  constructor(private readonly pool: pg.Pool) {}

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
      const existing = await classes.findById(classId);
      if (!existing || existing.account_id !== accountId) {
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

      const source = await classes.findById(sourceClassId);
      if (!source || source.account_id !== accountId) {
        throw new AppError('CLASS_NOT_FOUND', '班级不存在');
      }
      if (source.deleted_at) {
        throw new AppError('CLASS_TRASHED', '班级已在废纸篓中');
      }

      const created = await classes.create(accountId, input.name);
      const sourceWorkspaces = await workspaces.listForClass(accountId, sourceClassId);
      for (const ws of sourceWorkspaces) {
        await workspaces.ensureClassWorkspace(accountId, created.class_id, ws.subject_id);
      }

      if (input.includeProgress) {
        // Sync resource duplication lands in Task 7; copy preserves class shells only for now.
      }

      return toClassRecord(created);
    });
  }

  async deleteClass(accountId: string, classId: string): Promise<ClassRecord> {
    return withTenantTransaction(this.pool, accountId, async (client) => {
      const classes = new ClassRepository(client);
      const workspaces = new WorkspaceRepository(client);

      const existing = await classes.findById(classId);
      if (!existing || existing.account_id !== accountId) {
        throw new AppError('CLASS_NOT_FOUND', '班级不存在');
      }
      if (existing.deleted_at) {
        throw new AppError('CLASS_TRASHED', '班级已在废纸篓中');
      }

      await workspaces.tombstoneForClass(classId, accountId);
      const row = await classes.softDelete(classId, accountId);
      if (!row) {
        throw new AppError('CLASS_NOT_FOUND', '班级不存在');
      }
      return toClassRecord(row);
    });
  }

  async restoreClass(accountId: string, classId: string): Promise<ClassRecord> {
    return withTenantTransaction(this.pool, accountId, async (client) => {
      const classes = new ClassRepository(client);
      const workspaces = new WorkspaceRepository(client);

      const existing = await classes.findById(classId);
      if (!existing || existing.account_id !== accountId) {
        throw new AppError('CLASS_NOT_FOUND', '班级不存在');
      }
      if (!existing.deleted_at) {
        throw new AppError('CLASS_NOT_FOUND', '班级不在废纸篓中');
      }

      const row = await classes.restore(classId, accountId);
      if (!row) {
        throw new AppError('CLASS_NOT_FOUND', '班级无法恢复');
      }
      await workspaces.restoreForClass(classId, accountId);
      return toClassRecord(row);
    });
  }

  async ensurePersonalWorkspace(accountId: string, subjectId: string) {
    return withTenantTransaction(this.pool, accountId, async (client) => {
      const workspaces = new WorkspaceRepository(client);
      const row = await workspaces.ensurePersonal(accountId, subjectId);
      return {
        id: row.workspace_id,
        classId: row.class_id,
        accountId: row.account_id,
        subjectId: row.subject_id,
        kind: row.kind,
      };
    });
  }
}
