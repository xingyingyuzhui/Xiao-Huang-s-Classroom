import { AppError } from '@xiaohuang/domain-core';
import type { SyncEntityEnvelope, SyncOperation, SyncPullResponse, SyncPushResponse } from '@xiaohuang/contracts';
import type pg from 'pg';
import { WorkspaceRepository } from '../db/repositories/workspace.js';
import { withTenantTransaction } from '../db/tenant.js';
import { SyncRepository } from './repository.js';

const DEFAULT_PULL_LIMIT = 100;

type PushOutcome = Pick<SyncPushResponse, 'applied' | 'rejected' | 'conflicts'>;

function revisionSummary(revision: number): string {
  return `revision:${revision}`;
}

function parseCursorSequence(cursor: string | null): number {
  if (cursor === null) {
    return 0;
  }
  const parsed = Number.parseInt(cursor, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || String(parsed) !== cursor) {
    throw new AppError('SYNC_CURSOR_STALE', '同步游标无效');
  }
  return parsed;
}

function toPullChange(row: {
  resource_type: string;
  resource_id: string;
  revision: string;
  schema_version: number;
  payload: unknown;
  content_hash: string;
  deleted_at: Date | null;
}) {
  return {
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    revision: Number(row.revision),
    schemaVersion: row.schema_version,
    payload: row.payload,
    contentHash: row.content_hash,
    deletedAt: row.deleted_at?.toISOString() ?? null,
  };
}

function isConflict(
  existing: { revision: string } | null,
  envelope: SyncEntityEnvelope,
): boolean {
  if (envelope.baseRevision === null) {
    return false;
  }
  if (!existing) {
    return envelope.baseRevision !== 0;
  }
  return envelope.baseRevision !== Number(existing.revision);
}

export class SyncService {
  constructor(private readonly pool: pg.Pool) {}

  async push(accountId: string, workspaceId: string, operations: SyncOperation[]): Promise<PushOutcome> {
    return withTenantTransaction(this.pool, accountId, async (client) => {
      const sync = new SyncRepository(client);
      const workspaces = new WorkspaceRepository(client);

      const workspace = await workspaces.findById(workspaceId);
      if (!workspace || workspace.account_id !== accountId || workspace.deleted_at) {
        throw new AppError('FORBIDDEN_WORKSPACE', '工作区不存在或无权访问');
      }

      const applied: string[] = [];
      const rejected: PushOutcome['rejected'] = [];
      const conflicts: PushOutcome['conflicts'] = [];

      for (const operation of operations) {
        const { operationId, envelope } = operation;

        if (envelope.workspaceId !== workspaceId) {
          rejected.push({
            operationId,
            code: 'FORBIDDEN_WORKSPACE',
            message: '操作工作区不匹配',
          });
          continue;
        }

        const existingOperation = await sync.findOperation(accountId, operationId);
        if (existingOperation) {
          applied.push(operationId);
          continue;
        }

        const existing = await sync.findResource(
          workspaceId,
          envelope.resourceType,
          envelope.resourceId,
        );

        if (isConflict(existing, envelope)) {
          conflicts.push({
            operationId,
            conflict: {
              resourceType: envelope.resourceType,
              resourceId: envelope.resourceId,
              localSummary: revisionSummary(envelope.revision),
              cloudSummary: revisionSummary(existing ? Number(existing.revision) : 0),
              baseSummary:
                envelope.baseRevision === null ? null : revisionSummary(envelope.baseRevision),
            },
          });
          continue;
        }

        const revision = await sync.upsertResource(accountId, workspaceId, envelope);
        await sync.recordOperation(accountId, operationId, workspaceId, 'applied');
        await sync.appendChangeLog(
          accountId,
          workspaceId,
          envelope.resourceType,
          envelope.resourceId,
          revision,
          operationId,
        );
        applied.push(operationId);
      }

      return { applied, rejected, conflicts };
    });
  }

  async pull(
    accountId: string,
    workspaceId: string,
    cursor: string | null,
    limit = DEFAULT_PULL_LIMIT,
  ): Promise<Omit<SyncPullResponse, 'requestId'>> {
    return withTenantTransaction(this.pool, accountId, async (client) => {
      const sync = new SyncRepository(client);
      const workspaces = new WorkspaceRepository(client);

      const workspace = await workspaces.findById(workspaceId);
      if (!workspace || workspace.account_id !== accountId || workspace.deleted_at) {
        throw new AppError('FORBIDDEN_WORKSPACE', '工作区不存在或无权访问');
      }

      const afterSequence = parseCursorSequence(cursor);
      const rows = await sync.pullChanges(workspaceId, afterSequence, limit + 1);
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);

      const lastSequence =
        page.length > 0 ? Number(page[page.length - 1]!.sequence) : afterSequence;

      return {
        cursor: String(lastSequence),
        sequence: lastSequence,
        changes: page.map(toPullChange),
        hasMore,
      };
    });
  }
}
