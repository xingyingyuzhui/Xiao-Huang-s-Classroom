import { SyncSession } from '@xiaohuang/sync-core';
import type { ConflictResolution, SyncContext } from '@xiaohuang/sync-core';
import { AppError } from '@xiaohuang/domain-core';
import type { CloudClient } from '../shared/api/cloud-client.js';
import { computeContentHash } from '../shared/persistence/indexeddb/hash.js';
import type { OutboxStatusPatch } from '../shared/persistence/indexeddb/outbox-repository.js';
import type { SyncStatusStore } from './sync-status-store.js';
import type { ConflictSideSnapshot, ConflictStore, StoredConflict } from './conflict-store.js';
import type { ResourceRegistry } from './resource-registry.js';
import type { WorkspaceContextStore } from '../workspace/workspace-context-store.js';
import type { LocalResourceService } from './local-resource-service.js';

export type OutboxOperationInput = {
  operationId: string;
  resourceType: string;
  resourceId: string;
  payload: unknown;
  baseRevision: number | null;
  deletedAt: number | null;
  schemaVersion?: number;
};

export type SyncControllerDeps = {
  client: CloudClient;
  statusStore: SyncStatusStore;
  conflictStore: ConflictStore;
  registry: ResourceRegistry;
  contextStore: WorkspaceContextStore;
  getOutboxOperations: () => Promise<OutboxOperationInput[]>;
  ackOutboxOperations: (operationIds: string[]) => Promise<void>;
  applyPulledChanges: (
    changes: Array<{
      resourceType: string;
      resourceId: string;
      revision: number;
      payload: unknown;
      deletedAt: number | null;
    }>,
  ) => Promise<void>;
  saveCursor: (cursor: { token: string; sequence: number }) => Promise<void>;
  loadCursor: () => Promise<{ token: string; sequence: number } | null>;
  countPendingOutbox?: () => Promise<number>;
  updateOutboxStatuses?: (patches: OutboxStatusPatch[]) => Promise<void>;
  revertInflightOutbox?: () => Promise<void>;
  localResources?: LocalResourceService;
  createOperationId?: () => string;
};

type PushConflict = {
  operationId: string;
  conflict: {
    resourceType: string;
    resourceId: string;
    localSummary: string;
    cloudSummary: string;
    baseSummary: string | null;
    cloudRevision?: number;
    cloudSchemaVersion?: number;
    cloudPayload?: unknown;
    cloudDeletedAt?: string | null;
  };
};

function syncKindFromContext(kind: string): SyncContext['kind'] {
  if (kind === 'personal') return 'account';
  if (kind === 'guest' || kind === 'account' || kind === 'class' || kind === 'subject') {
    return kind;
  }
  return 'account';
}

function describeSyncError(error: unknown): string {
  if (error instanceof AppError) {
    switch (error.code) {
      case 'FORBIDDEN_WORKSPACE':
        return '工作区已失效，请回到个人空间后再同步';
      case 'AUTH_SESSION_EXPIRED':
        return '登录已过期，请重新登录';
      case 'SYNC_CURSOR_STALE':
        return '同步游标已过期，请再点一次同步';
      default:
        return error.message || '同步失败';
    }
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError' || /aborted/i.test(error.message)) {
      return '同步已取消';
    }
    return error.message;
  }
  return String(error);
}

function parseRevision(summary: string | null | undefined): number | null {
  if (!summary) return null;
  const match = /^revision:(\d+)$/.exec(summary);
  return match ? Number(match[1]) : null;
}

function sideSnapshot(input: {
  payload: unknown;
  revision: number | null;
  schemaVersion: number | null;
  summary?: string;
  deletedAt?: number | null;
}): ConflictSideSnapshot {
  return {
    payload: input.payload,
    revision: input.revision,
    schemaVersion: input.schemaVersion,
    ...(input.summary != null ? { summary: input.summary } : {}),
    ...(input.deletedAt != null ? { deletedAt: input.deletedAt } : {}),
  };
}

export class SyncController {
  private session: SyncSession | null = null;
  private abortController: AbortController | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(private deps: SyncControllerDeps) {}

  isRunning(): boolean {
    return this.running;
  }

  async startSync(): Promise<void> {
    if (this.running) {
      return;
    }

    this.clearIdleTimer();
    const ctx = this.deps.contextStore.getContext();
    const syncContext: SyncContext = {
      accountId: ctx.accountId ?? '',
      workspaceId: ctx.workspaceId,
      subjectId: ctx.subjectId,
      classId: ctx.classId ?? null,
      kind: syncKindFromContext(ctx.kind),
      generation: ctx.generation,
    };

    const session = new SyncSession({ context: syncContext, online: true });
    this.session = session;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this.running = true;

    const startResult = session.startSync(Date.now());
    if (!startResult.started) {
      this.running = false;
      this.deps.statusStore.update({ phase: session.getPhase(), lastError: startResult.reason });
      return;
    }

    this.deps.statusStore.update({ phase: 'pushing', lastError: null });

    try {
      const outboxOps = await this.deps.getOutboxOperations();
      this.throwIfStale(signal, syncContext.workspaceId);

      const appliedIds: string[] = [];
      let rejected = [] as Array<{ operationId: string; code?: string; message?: string }>;
      let conflicts: PushConflict[] = [];

      if (outboxOps.length > 0) {
        await this.markOutbox(outboxOps.map((op) => ({ operationId: op.operationId, status: 'inflight' })));

        for (const op of outboxOps) {
          session.outbox.append({
            operationId: op.operationId,
            resourceType: op.resourceType,
            resourceId: op.resourceId,
            payload: op.payload,
            baseRevision: op.baseRevision,
            createdAt: Date.now(),
            deletedAt: op.deletedAt,
          });
        }

        const operations = [];
        for (const op of outboxOps) {
          const adapter = this.deps.registry.get(op.resourceType);
          operations.push({
            operationId: op.operationId,
            envelope: {
              resourceType: op.resourceType,
              resourceId: op.resourceId,
              workspaceId: syncContext.workspaceId,
              schemaVersion: adapter?.schemaVersion ?? op.schemaVersion ?? 1,
              revision: 0,
              baseRevision: op.baseRevision,
              payload: op.payload,
              contentHash: await computeContentHash(op.payload),
              deletedAt: op.deletedAt != null ? new Date(op.deletedAt).toISOString() : null,
            },
          });
        }

        const pushResponse = await this.deps.client.syncPush(
          syncContext.workspaceId,
          operations,
          signal,
        );
        this.throwIfStale(signal, syncContext.workspaceId);

        appliedIds.push(...(pushResponse.applied ?? []));
        rejected = pushResponse.rejected ?? [];
        conflicts = (pushResponse.conflicts ?? []) as PushConflict[];

        // Persist applied acks even if later ops in the batch conflict or the in-memory machine throws.
        await this.persistPushOutcomes(outboxOps, appliedIds, rejected, conflicts);

        let pushResult: { handled: boolean; phase?: string };
        try {
          pushResult = session.handlePushResponse(
            {
              generation: syncContext.generation,
              results: [
                ...appliedIds.map((id) => ({ status: 'applied' as const, operationId: id })),
                ...rejected.map((r) => ({
                  status: 'rejected' as const,
                  operationId: r.operationId,
                  reason: r.message ?? r.code ?? 'rejected',
                })),
                ...conflicts.map((c) => ({
                  status: 'conflict' as const,
                  operationId: c.operationId,
                  conflict: this.toConflictRecord(c, outboxOps, syncContext.workspaceId),
                })),
              ],
            },
            Date.now(),
          );
        } catch {
          pushResult = { handled: true, phase: conflicts.length > 0 ? 'conflict' : 'pulling' };
        }

        if (!pushResult.handled) {
          if (signal.aborted) return;
          await this.revertInflight();
          await this.publishPendingCount({
            phase: 'failed',
            lastError: '上传结果已过期，请再点一次同步',
          });
          return;
        }

        if (conflicts.length > 0 || pushResult.phase === 'conflict') {
          for (const c of conflicts) {
            const record = this.toConflictRecord(c, outboxOps, syncContext.workspaceId);
            if (this.deps.conflictStore.wasResolved?.(record.conflictId)) continue;
            this.deps.conflictStore.add(record);
          }
          await this.publishPendingCount({
            phase: 'conflict',
            conflictCount: this.deps.conflictStore.listUnresolved().length,
          });
          return;
        }

        if (rejected.length > 0) {
          // Rejected must not look like a successful completed sync; still pull remaining cloud changes.
          await this.pullAll(session, syncContext, signal);
          const reasons = rejected.map((r) => r.message || r.code || r.operationId).join('；');
          await this.publishPendingCount({
            phase: 'failed',
            lastError: `部分更改被拒绝：${reasons}`,
            lastSyncedAt: Date.now(),
          });
          return;
        }
      } else {
        const pushResult = session.handlePushResponse(
          { generation: syncContext.generation, results: [] },
          Date.now(),
        );
        if (!pushResult.handled) {
          if (signal.aborted) return;
          await this.publishPendingCount({
            phase: 'failed',
            lastError: '无法开始下载，请再点一次同步',
          });
          return;
        }
      }

      this.throwIfStale(signal, syncContext.workspaceId);
      await this.pullAll(session, syncContext, signal);

      await this.publishPendingCount({
        phase: 'completed',
        lastSyncedAt: Date.now(),
        lastError: null,
      });
      this.scheduleIdle();
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        await this.revertInflight();
        await this.publishPendingCount({ phase: 'cancelled', lastError: null });
        return;
      }
      await this.revertInflight();
      const message = describeSyncError(error);
      session.fail(message, Date.now());
      await this.publishPendingCount({ phase: 'failed', lastError: message });
    } finally {
      this.running = false;
    }
  }

  cancel(): void {
    this.clearIdleTimer();
    this.abortController?.abort();
    this.session?.cancel();
    this.running = false;
    this.deps.statusStore.update({ phase: 'cancelled' });
    void this.revertInflight().then(() => this.publishPendingCount({ phase: 'cancelled' }));
  }

  async resolveConflict(conflictId: string, resolution: ConflictResolution): Promise<void> {
    const stored = this.deps.conflictStore.get(conflictId);
    if (!stored || stored.resolution != null) return;

    if (resolution === 'duplicateLocal' && !stored.supportsDuplicateLocal) {
      return;
    }

    const nextOperationId =
      this.deps.createOperationId?.() ??
      `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    if (this.deps.localResources) {
      await this.deps.localResources.resolveConflictAtomically({
        conflict: stored,
        resolution,
        nextOperationId,
      });
    }

    this.deps.conflictStore.resolve(conflictId, resolution);
    this.session?.resolveConflict(conflictId, resolution, Date.now());
    await this.publishPendingCount({
      phase: this.deps.conflictStore.listUnresolved().length === 0 ? 'idle' : 'conflict',
      conflictCount: this.deps.conflictStore.listUnresolved().length,
    });
  }

  private async pullAll(
    session: SyncSession,
    syncContext: SyncContext,
    signal: AbortSignal,
  ): Promise<void> {
    this.deps.statusStore.update({ phase: 'pulling' });
    const savedCursor = await this.deps.loadCursor();
    let cursor: string | null = savedCursor?.token ?? null;
    let hasMore = true;

    while (hasMore) {
      this.throwIfStale(signal, syncContext.workspaceId);
      const pullResponse = await this.deps.client.syncPull(
        syncContext.workspaceId,
        cursor,
        undefined,
        signal,
      );
      this.throwIfStale(signal, syncContext.workspaceId);

      const pullResult = session.handlePullResponse({
        generation: syncContext.generation,
        cursor: { token: pullResponse.cursor, sequence: pullResponse.sequence },
        changes: pullResponse.changes.map((c) => ({
          resourceType: c.resourceType,
          resourceId: c.resourceId,
          revision: c.revision,
          payload: c.payload,
          deletedAt: c.deletedAt != null ? Date.parse(c.deletedAt) : null,
        })),
        hasMore: pullResponse.hasMore,
      });

      if (!pullResult.handled) break;

      await this.deps.applyPulledChanges(
        pullResponse.changes.map((c) => ({
          resourceType: c.resourceType,
          resourceId: c.resourceId,
          revision: c.revision,
          payload: c.payload,
          deletedAt: c.deletedAt != null ? Date.parse(c.deletedAt) : null,
        })),
      );

      await this.deps.saveCursor({ token: pullResponse.cursor, sequence: pullResponse.sequence });
      cursor = pullResponse.cursor;
      hasMore = pullResponse.hasMore;
    }
  }

  private toConflictRecord(
    c: PushConflict,
    outboxOps: OutboxOperationInput[],
    workspaceId: string,
  ): StoredConflict {
    const localOp = outboxOps.find((op) => op.operationId === c.operationId);
    const adapter = this.deps.registry.get(c.conflict.resourceType);
    const localSchema = localOp?.schemaVersion ?? adapter?.schemaVersion ?? 1;
    const cloudDeletedAt =
      c.conflict.cloudDeletedAt != null ? Date.parse(c.conflict.cloudDeletedAt) : null;
    return {
      conflictId: `${c.conflict.resourceType}:${c.conflict.resourceId}:${c.operationId}`,
      resourceType: c.conflict.resourceType,
      resourceId: c.conflict.resourceId,
      operationId: c.operationId,
      workspaceId,
      snapshot: {
        local: sideSnapshot({
          payload: localOp?.payload ?? null,
          revision: localOp?.baseRevision ?? null,
          schemaVersion: localSchema,
          summary: c.conflict.localSummary,
          deletedAt: localOp?.deletedAt ?? null,
        }),
        cloud: sideSnapshot({
          payload: c.conflict.cloudPayload ?? c.conflict.cloudSummary,
          revision: c.conflict.cloudRevision ?? parseRevision(c.conflict.cloudSummary),
          schemaVersion: c.conflict.cloudSchemaVersion ?? null,
          summary: c.conflict.cloudSummary,
          deletedAt: Number.isFinite(cloudDeletedAt) ? cloudDeletedAt : null,
        }),
        base: localOp?.baseRevision != null
          ? sideSnapshot({
              payload: null,
              revision: localOp.baseRevision,
              schemaVersion: localSchema,
              ...(c.conflict.baseSummary != null ? { summary: c.conflict.baseSummary } : {}),
            })
          : null,
      },
      supportsDuplicateLocal: adapter?.supportsDuplicateLocal ?? false,
      resolvedAt: null,
      resolution: null,
    };
  }

  private async persistPushOutcomes(
    outboxOps: OutboxOperationInput[],
    appliedIds: string[],
    rejected: Array<{ operationId: string; code?: string; message?: string }>,
    conflicts: PushConflict[],
  ): Promise<void> {
    if (appliedIds.length > 0) {
      await this.deps.ackOutboxOperations(appliedIds);
    }

    const patches: OutboxStatusPatch[] = [];
    for (const item of rejected) {
      patches.push({
        operationId: item.operationId,
        status: 'rejected',
        rejectedCode: item.code ?? null,
        rejectedMessage: item.message ?? null,
      });
    }
    for (const item of conflicts) {
      patches.push({ operationId: item.operationId, status: 'conflict' });
    }

    const known = new Set([
      ...appliedIds,
      ...rejected.map((r) => r.operationId),
      ...conflicts.map((c) => c.operationId),
    ]);
    for (const op of outboxOps) {
      if (!known.has(op.operationId)) {
        patches.push({ operationId: op.operationId, status: 'pending' });
      }
    }

    await this.markOutbox(patches);
  }

  private async markOutbox(patches: OutboxStatusPatch[]): Promise<void> {
    if (patches.length === 0 || !this.deps.updateOutboxStatuses) return;
    try {
      await this.deps.updateOutboxStatuses(patches);
    } catch {
      /* missing ops or already applied — durable ack is best-effort after HTTP success */
    }
  }

  private async revertInflight(): Promise<void> {
    if (this.deps.revertInflightOutbox) {
      await this.deps.revertInflightOutbox();
      return;
    }
    if (this.deps.updateOutboxStatuses) {
      const pending = await this.deps.getOutboxOperations();
      await this.markOutbox(pending.map((op) => ({ operationId: op.operationId, status: 'pending' })));
    }
  }

  private async readPendingCount(): Promise<number> {
    if (this.deps.countPendingOutbox) {
      return this.deps.countPendingOutbox();
    }
    const ops = await this.deps.getOutboxOperations();
    return ops.length;
  }

  private async publishPendingCount(partial: Parameters<SyncStatusStore['update']>[0]): Promise<void> {
    const pendingCount = await this.readPendingCount();
    this.deps.statusStore.update({ ...partial, pendingCount });
  }

  private throwIfStale(signal: AbortSignal, workspaceId: string): void {
    if (signal.aborted || this.deps.contextStore.getContext().workspaceId !== workspaceId) {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      throw error;
    }
  }

  private scheduleIdle(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      const status = this.deps.statusStore.getStatus();
      if (status.phase === 'completed') {
        this.deps.statusStore.update({ phase: 'idle' });
      }
    }, 2500);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer != null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}
