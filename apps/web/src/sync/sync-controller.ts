import { SyncSession } from '@xiaohuang/sync-core';
import type { ConflictResolution, SyncContext } from '@xiaohuang/sync-core';
import { AppError } from '@xiaohuang/domain-core';
import type { CloudClient } from '../shared/api/cloud-client.js';
import type { SyncStatusStore } from './sync-status-store.js';
import type { ConflictStore } from './conflict-store.js';
import type { ResourceRegistry } from './resource-registry.js';
import type { WorkspaceContextStore } from '../workspace/workspace-context-store.js';

export type SyncControllerDeps = {
  client: CloudClient;
  statusStore: SyncStatusStore;
  conflictStore: ConflictStore;
  registry: ResourceRegistry;
  contextStore: WorkspaceContextStore;
  getOutboxOperations: () => Promise<
    Array<{
      operationId: string;
      resourceType: string;
      resourceId: string;
      payload: unknown;
      baseRevision: number | null;
      deletedAt: number | null;
    }>
  >;
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

      if (outboxOps.length > 0) {
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

        const operations = outboxOps.map((op) => ({
          operationId: op.operationId,
          envelope: {
            resourceType: op.resourceType,
            resourceId: op.resourceId,
            workspaceId: syncContext.workspaceId,
            schemaVersion: this.deps.registry.get(op.resourceType)?.schemaVersion ?? 1,
            revision: 0,
            baseRevision: op.baseRevision,
            payload: op.payload,
            contentHash: this.deps.registry.get(op.resourceType)?.computeHash(op.payload) ?? '',
            deletedAt: op.deletedAt != null ? new Date(op.deletedAt).toISOString() : null,
          },
        }));

        const pushResponse = await this.deps.client.syncPush(
          syncContext.workspaceId,
          operations,
          signal,
        );
        this.throwIfStale(signal, syncContext.workspaceId);

        const applied = pushResponse.applied ?? [];
        const rejected = pushResponse.rejected ?? [];
        const conflicts = pushResponse.conflicts ?? [];

        let pushResult: { handled: boolean; phase?: string };
        try {
          pushResult = session.handlePushResponse(
            {
              generation: syncContext.generation,
              results: [
                ...applied.map((id) => ({ status: 'applied' as const, operationId: id })),
                ...rejected.map((r) => ({
                  status: 'rejected' as const,
                  operationId: r.operationId,
                  reason: r.message,
                })),
                ...conflicts.map((c) => ({
                  status: 'conflict' as const,
                  operationId: c.operationId,
                  conflict: {
                    conflictId: `${c.conflict.resourceType}:${c.conflict.resourceId}`,
                    resourceType: c.conflict.resourceType,
                    resourceId: c.conflict.resourceId,
                    snapshot: {
                      local: null,
                      cloud: null,
                      base: null,
                    },
                    supportsDuplicateLocal: false,
                    resolvedAt: null,
                    resolution: null,
                  },
                })),
              ],
            },
            Date.now(),
          );
        } catch {
          // HTTP push succeeded; don't skip pull if the in-memory outbox is fussy.
          pushResult = { handled: true, phase: 'pulling' };
        }

        if (!pushResult.handled) {
          if (signal.aborted) return;
          this.deps.statusStore.update({
            phase: 'failed',
            lastError: '上传结果已过期，请再点一次同步',
          });
          return;
        }

        if (pushResult.phase === 'conflict') {
          for (const c of conflicts) {
            this.deps.conflictStore.add({
              conflictId: `${c.conflict.resourceType}:${c.conflict.resourceId}`,
              resourceType: c.conflict.resourceType,
              resourceId: c.conflict.resourceId,
              snapshot: { local: null, cloud: null, base: null },
              supportsDuplicateLocal: false,
              resolvedAt: null,
              resolution: null,
            });
          }
          this.deps.statusStore.update({
            phase: 'conflict',
            conflictCount: conflicts.length,
          });
          return;
        }

        await this.deps.ackOutboxOperations(applied);
      } else {
        const pushResult = session.handlePushResponse(
          { generation: syncContext.generation, results: [] },
          Date.now(),
        );
        if (!pushResult.handled) {
          if (signal.aborted) return;
          this.deps.statusStore.update({
            phase: 'failed',
            lastError: '无法开始下载，请再点一次同步',
          });
          return;
        }
      }

      this.throwIfStale(signal, syncContext.workspaceId);
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

      this.deps.statusStore.update({
        phase: 'completed',
        lastSyncedAt: Date.now(),
        lastError: null,
        pendingCount: 0,
      });
      this.scheduleIdle();
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        this.deps.statusStore.update({ phase: 'cancelled', lastError: null });
        return;
      }
      const message = describeSyncError(error);
      session.fail(message, Date.now());
      this.deps.statusStore.update({ phase: 'failed', lastError: message });
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
  }

  resolveConflict(conflictId: string, resolution: ConflictResolution): void {
    this.deps.conflictStore.resolve(conflictId, resolution);
    this.session?.resolveConflict(conflictId, resolution, Date.now());
    if (this.deps.conflictStore.listUnresolved().length === 0) {
      this.deps.statusStore.update({ phase: 'idle', conflictCount: 0 });
    }
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
