import { AppError } from '@xiaohuang/domain-core';
import type { SyncEntityEnvelope, SyncOperation, SyncPullResponse, SyncPushResponse } from '@xiaohuang/contracts';
import type pg from 'pg';
import { WorkspaceRepository } from '../db/repositories/workspace.js';
import { withTenantTransaction } from '../db/tenant.js';
import { computeContentHash } from './hash.js';
import { consumeSyncPushQuota } from './rate-limit.js';
import { SyncRepository, type PullChangeRow, type SyncResourceRow } from './repository.js';
import { syncStorageLimitsFromEnv, validateSyncEnvelope } from './resource-validation.js';

const DEFAULT_PULL_LIMIT = 100;

type CloudConflict = {
  resourceType: string;
  resourceId: string;
  localSummary: string;
  cloudSummary: string;
  baseSummary: string | null;
  cloudRevision: number;
  cloudSchemaVersion: number;
  cloudPayload: unknown;
  cloudDeletedAt: string | null;
};

type PushOutcome = {
  applied: SyncPushResponse['applied'];
  rejected: SyncPushResponse['rejected'];
  conflicts: Array<{ operationId: string; conflict: CloudConflict }>;
};

type ConflictEntry = PushOutcome['conflicts'][number];

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

function shouldConflict(
  existing: { revision: string } | null,
  envelope: SyncEntityEnvelope,
): boolean {
  if (envelope.baseRevision === null) {
    return existing !== null;
  }
  if (!existing) {
    return true;
  }
  return envelope.baseRevision !== Number(existing.revision);
}

function toConflictEntry(
  operationId: string,
  envelope: SyncEntityEnvelope,
  existing: SyncResourceRow | null,
): ConflictEntry {
  const cloudRevision = existing ? Number(existing.revision) : 0;
  return {
    operationId,
    conflict: {
      resourceType: envelope.resourceType,
      resourceId: envelope.resourceId,
      localSummary: revisionSummary(envelope.revision),
      cloudSummary: revisionSummary(cloudRevision),
      baseSummary: envelope.baseRevision === null ? null : revisionSummary(envelope.baseRevision),
      cloudRevision,
      cloudSchemaVersion: existing?.schema_version ?? envelope.schemaVersion,
      cloudPayload: existing?.payload ?? null,
      cloudDeletedAt: existing?.deleted_at?.toISOString() ?? null,
    },
  };
}

/**
 * Pull de-dupes by resource within the cursor page and returns the latest state
 * in range (simpler than snapshot-per-changelog). Cursor still advances by the
 * last consumed changelog sequence so no rows are skipped.
 */
function dedupeLatestInPage(page: PullChangeRow[]): PullChangeRow[] {
  const latest = new Map<string, PullChangeRow>();
  for (const row of page) {
    const key = `${row.resource_type}\0${row.resource_id}`;
    const prev = latest.get(key);
    if (!prev || Number(row.sequence) >= Number(prev.sequence)) {
      latest.set(key, row);
    }
  }
  return [...latest.values()].sort((a, b) => Number(a.sequence) - Number(b.sequence));
}

export class SyncService {
  constructor(private readonly pool: pg.Pool) {}

  async push(accountId: string, workspaceId: string, operations: SyncOperation[]): Promise<PushOutcome> {
    const limits = syncStorageLimitsFromEnv();
    if (operations.length > limits.maxOperationsPerPush) {
      throw new AppError(
        'SYNC_PAYLOAD_TOO_LARGE',
        `单次同步操作数超过限制 (${operations.length} > ${limits.maxOperationsPerPush})`,
      );
    }
    if (!consumeSyncPushQuota(accountId, limits.maxPushRequestsPerMinute)) {
      throw new AppError('SYNC_RATE_LIMITED', '同步请求过于频繁，请稍后再试');
    }

    return withTenantTransaction(this.pool, accountId, async (client) => {
      const sync = new SyncRepository(client);
      const workspaces = new WorkspaceRepository(client);

      const workspace = await workspaces.findById(workspaceId);
      if (!workspace || workspace.account_id !== accountId || workspace.deleted_at) {
        throw new AppError('FORBIDDEN_WORKSPACE', '工作区不存在或无权访问');
      }

      const workspaceResourceCount = await sync.countResourcesInWorkspace(workspaceId);
      const accountBytes = await sync.sumPayloadBytesForAccount(accountId);

      const applied: string[] = [];
      const rejected: PushOutcome['rejected'] = [];
      const conflicts: PushOutcome['conflicts'] = [];
      let pendingCreates = 0;
      let pendingBytes = 0;

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

        const validation = validateSyncEnvelope(envelope);
        if (validation) {
          rejected.push({
            operationId,
            code: validation.code,
            message: validation.message,
          });
          continue;
        }

        const expectedHash = computeContentHash(envelope.payload);
        if (envelope.contentHash !== expectedHash) {
          rejected.push({
            operationId,
            code: 'SYNC_HASH_MISMATCH',
            message: '内容哈希与载荷不一致',
          });
          continue;
        }

        const existingOperation = await sync.findOperation(accountId, operationId);
        if (existingOperation) {
          const storedHash = existingOperation.content_hash;
          if (storedHash && storedHash !== expectedHash) {
            rejected.push({
              operationId,
              code: 'SYNC_OPERATION_PAYLOAD_MISMATCH',
              message: '相同操作已用不同载荷提交',
            });
            continue;
          }
          applied.push(operationId);
          continue;
        }

        const existing = await sync.findResource(
          workspaceId,
          envelope.resourceType,
          envelope.resourceId,
        );

        if (shouldConflict(existing, envelope)) {
          conflicts.push(toConflictEntry(operationId, envelope, existing));
          continue;
        }

        if (!existing) {
          if (workspaceResourceCount + pendingCreates >= limits.maxResourcesPerWorkspace) {
            rejected.push({
              operationId,
              code: 'SYNC_WORKSPACE_LIMIT',
              message: '工作区资源数量已达上限',
            });
            continue;
          }
        }

        const payloadBytes = Buffer.byteLength(JSON.stringify(envelope.payload ?? null), 'utf8');
        if (accountBytes + pendingBytes + payloadBytes > limits.maxBytesPerAccount) {
          rejected.push({
            operationId,
            code: 'SYNC_ACCOUNT_QUOTA',
            message: '账户同步数据总量已达上限',
          });
          continue;
        }

        const verified: SyncEntityEnvelope = { ...envelope, contentHash: expectedHash };
        let revision: number | null = null;
        if (envelope.baseRevision === null) {
          revision = await sync.tryInsertResource(accountId, workspaceId, verified);
          if (revision === null) {
            const racedOperation = await sync.findOperation(accountId, operationId);
            if (
              racedOperation &&
              (!racedOperation.content_hash || racedOperation.content_hash === expectedHash)
            ) {
              applied.push(operationId);
              continue;
            }
            const raced = await sync.findResource(
              workspaceId,
              envelope.resourceType,
              envelope.resourceId,
            );
            conflicts.push(toConflictEntry(operationId, envelope, raced));
            continue;
          }
        } else {
          revision = await sync.updateResourceCas(
            workspaceId,
            envelope.resourceType,
            envelope.resourceId,
            envelope.baseRevision,
            verified,
          );
          if (revision === null) {
            const racedOperation = await sync.findOperation(accountId, operationId);
            if (
              racedOperation &&
              (!racedOperation.content_hash || racedOperation.content_hash === expectedHash)
            ) {
              applied.push(operationId);
              continue;
            }
            const raced = await sync.findResource(
              workspaceId,
              envelope.resourceType,
              envelope.resourceId,
            );
            conflicts.push(toConflictEntry(operationId, envelope, raced));
            continue;
          }
        }

        const recorded = await sync.claimOperation(accountId, operationId, workspaceId, expectedHash);
        if (recorded === 'duplicate') {
          applied.push(operationId);
          continue;
        }
        if (recorded === 'mismatch') {
          rejected.push({
            operationId,
            code: 'SYNC_OPERATION_PAYLOAD_MISMATCH',
            message: '相同操作已用不同载荷提交',
          });
          continue;
        }

        await sync.appendChangeLog(
          accountId,
          workspaceId,
          envelope.resourceType,
          envelope.resourceId,
          revision,
          operationId,
        );
        if (!existing) {
          pendingCreates += 1;
        }
        pendingBytes += payloadBytes;
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
        changes: dedupeLatestInPage(page).map(toPullChange),
        hasMore,
      };
    });
  }
}
