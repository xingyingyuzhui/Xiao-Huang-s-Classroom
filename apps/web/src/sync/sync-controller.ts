import { SyncSession } from '@xiaohuang/sync-core';
import type { ConflictResolution, SyncContext } from '@xiaohuang/sync-core';
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

export class SyncController {
  private session: SyncSession | null = null;
  private abortController: AbortController | null = null;

  constructor(private deps: SyncControllerDeps) {}

  async startSync(): Promise<void> {
    const ctx = this.deps.contextStore.getContext();
    const syncContext: SyncContext = {
      accountId: ctx.accountId ?? '',
      workspaceId: ctx.workspaceId,
      subjectId: ctx.subjectId,
      classId: ctx.classId ?? null,
      kind: ctx.kind as SyncContext['kind'],
      generation: ctx.generation,
    };

    const session = new SyncSession({ context: syncContext, online: true });
    this.session = session;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const startResult = session.startSync(Date.now());
    if (!startResult.started) {
      this.deps.statusStore.update({ phase: session.getPhase(), lastError: startResult.reason });
      return;
    }

    this.deps.statusStore.update({ phase: 'pushing', lastError: null });

    try {
      // Push phase
      const outboxOps = await this.deps.getOutboxOperations();
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

        const pushResponse = await this.deps.client.syncPush(syncContext.workspaceId, operations, signal);

        const pushResult = session.handlePushResponse(
          {
            generation: syncContext.generation,
            results: [
              ...pushResponse.applied.map((id) => ({ status: 'applied' as const, operationId: id })),
              ...pushResponse.rejected.map((r) => ({ status: 'rejected' as const, operationId: r.operationId, reason: r.message })),
              ...pushResponse.conflicts.map((c) => ({
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

        if (!pushResult.handled) return;

        if (pushResult.phase === 'conflict') {
          for (const c of pushResponse.conflicts) {
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
            conflictCount: pushResponse.conflicts.length,
          });
          return;
        }

        await this.deps.ackOutboxOperations(pushResponse.applied);
      } else {
        // No outbox ops — skip to pulling
        session.handlePushResponse({ generation: syncContext.generation, results: [] }, Date.now());
      }

      // Pull phase
      this.deps.statusStore.update({ phase: 'pulling' });
      const savedCursor = await this.deps.loadCursor();
      let cursor: string | null = savedCursor?.token ?? null;
      let hasMore = true;

      while (hasMore) {
        const pullResponse = await this.deps.client.syncPull(syncContext.workspaceId, cursor, undefined, signal);

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
        phase: session.getPhase(),
        lastSyncedAt: Date.now(),
        pendingCount: 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      session.fail(message, Date.now());
      this.deps.statusStore.update({ phase: 'failed', lastError: message });
    }
  }

  cancel(): void {
    this.abortController?.abort();
    this.session?.cancel();
    this.deps.statusStore.update({ phase: 'cancelled' });
  }

  resolveConflict(conflictId: string, resolution: ConflictResolution): void {
    this.deps.conflictStore.resolve(conflictId, resolution);
    this.session?.resolveConflict(conflictId, resolution, Date.now());
    if (this.deps.conflictStore.listUnresolved().length === 0) {
      this.deps.statusStore.update({ phase: 'idle', conflictCount: 0 });
    }
  }
}
