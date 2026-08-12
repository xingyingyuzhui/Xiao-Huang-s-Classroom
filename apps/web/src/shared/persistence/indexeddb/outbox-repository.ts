import { AppError } from '@xiaohuang/domain-core';
import { idbRequest, idbTransactionComplete, STORE_OUTBOX } from './idb-primitives.js';

export const OUTBOX_STATUSES = ['pending', 'inflight', 'applied', 'rejected', 'conflict'] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

const RETRYABLE_STATUSES: ReadonlySet<OutboxStatus> = new Set(['pending', 'inflight']);

export type OutboxEntry = {
  operationId: string;
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  payload: unknown;
  baseRevision: number | null;
  basePayload: unknown | null;
  createdAt: number;
  deletedAt: number | null;
  status: OutboxStatus;
  appliedAt: number | null;
  schemaVersion?: number;
  rejectedCode?: string | null;
  rejectedMessage?: string | null;
};

export type OutboxAppendInput = {
  operationId: string;
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  payload: unknown;
  baseRevision: number | null;
  basePayload?: unknown | null;
  createdAt: number;
  deletedAt?: number | null;
  schemaVersion?: number;
};

export type OutboxStatusPatch = {
  operationId: string;
  status: OutboxStatus;
  appliedAt?: number | null;
  rejectedCode?: string | null;
  rejectedMessage?: string | null;
};

function isOutboxStatus(value: unknown): value is OutboxStatus {
  return (
    value === 'pending' ||
    value === 'inflight' ||
    value === 'applied' ||
    value === 'rejected' ||
    value === 'conflict'
  );
}

function normalizeEntry(entry: OutboxEntry): OutboxEntry {
  return {
    ...entry,
    basePayload: entry.basePayload ?? null,
    status: isOutboxStatus(entry.status) ? entry.status : 'pending',
    appliedAt: entry.appliedAt ?? null,
    deletedAt: entry.deletedAt ?? null,
  };
}

export function patchOutboxInTransaction(
  tx: IDBTransaction,
  _operationId: string,
  patch: OutboxStatusPatch,
  existing: OutboxEntry,
): void {
  if (existing.status === 'applied' && patch.status === 'applied') {
    return;
  }
  tx.objectStore(STORE_OUTBOX).put({
    ...existing,
    status: patch.status,
    appliedAt: patch.status === 'applied' ? (patch.appliedAt ?? Date.now()) : existing.appliedAt,
    rejectedCode: patch.rejectedCode ?? existing.rejectedCode ?? null,
    rejectedMessage: patch.rejectedMessage ?? existing.rejectedMessage ?? null,
  });
}

export function appendOutboxInTransaction(tx: IDBTransaction, input: OutboxAppendInput): void {
  const entry: OutboxEntry = {
    operationId: input.operationId,
    workspaceId: input.workspaceId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    payload: input.payload,
    baseRevision: input.baseRevision,
    basePayload: input.basePayload ?? null,
    createdAt: input.createdAt,
    deletedAt: input.deletedAt ?? null,
    status: 'pending',
    appliedAt: null,
    ...(input.schemaVersion != null ? { schemaVersion: input.schemaVersion } : {}),
  };
  tx.objectStore(STORE_OUTBOX).put(entry);
}

export class OutboxRepository {
  constructor(private readonly db: IDBDatabase) {}

  appendInTransaction(tx: IDBTransaction, input: OutboxAppendInput): void {
    appendOutboxInTransaction(tx, input);
  }

  async listPending(workspaceId?: string): Promise<OutboxEntry[]> {
    const all = await this.listAll(workspaceId);
    return all
      .filter((entry) => RETRYABLE_STATUSES.has(entry.status))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async countPending(workspaceId?: string): Promise<number> {
    const pending = await this.listPending(workspaceId);
    return pending.length;
  }

  async listAll(workspaceId?: string): Promise<OutboxEntry[]> {
    const tx = this.db.transaction(STORE_OUTBOX, 'readonly');
    const store = tx.objectStore(STORE_OUTBOX);
    const all = await idbRequest<OutboxEntry[]>(store.getAll());
    await idbTransactionComplete(tx);
    return all
      .map(normalizeEntry)
      .filter((entry) => (workspaceId ? entry.workspaceId === workspaceId : true));
  }

  async get(operationId: string): Promise<OutboxEntry | null> {
    const tx = this.db.transaction(STORE_OUTBOX, 'readonly');
    const entry = await idbRequest<OutboxEntry | undefined>(
      tx.objectStore(STORE_OUTBOX).get(operationId),
    );
    await idbTransactionComplete(tx);
    return entry ? normalizeEntry(entry) : null;
  }

  async markApplied(operationId: string, appliedAt: number): Promise<void> {
    await this.updateStatuses([{ operationId, status: 'applied', appliedAt }]);
  }

  async markInflight(operationIds: string[]): Promise<void> {
    await this.updateStatuses(operationIds.map((operationId) => ({ operationId, status: 'inflight' })));
  }

  async revertInflightToPending(workspaceId?: string): Promise<void> {
    const inflight = (await this.listAll(workspaceId)).filter((entry) => entry.status === 'inflight');
    if (inflight.length === 0) return;
    await this.updateStatuses(inflight.map((entry) => ({ operationId: entry.operationId, status: 'pending' })));
  }

  async append(input: OutboxAppendInput): Promise<void> {
    const tx = this.db.transaction(STORE_OUTBOX, 'readwrite');
    this.appendInTransaction(tx, input);
    await idbTransactionComplete(tx);
  }

  async updateStatuses(patches: OutboxStatusPatch[]): Promise<void> {
    if (patches.length === 0) return;
    const currentById = new Map((await this.listAll()).map((entry) => [entry.operationId, entry]));
    const tx = this.db.transaction(STORE_OUTBOX, 'readwrite');
    const store = tx.objectStore(STORE_OUTBOX);
    for (const patch of patches) {
      const existing = currentById.get(patch.operationId);
      if (!existing) {
        throw new AppError(
          'PERSISTENCE_WRITE',
          `Outbox operation not found: ${patch.operationId}`,
          'outbox',
        );
      }
      if (existing.status === 'applied' && patch.status === 'applied') {
        continue;
      }
      store.put({
        ...existing,
        status: patch.status,
        appliedAt: patch.status === 'applied' ? (patch.appliedAt ?? Date.now()) : existing.appliedAt,
        rejectedCode: patch.rejectedCode ?? existing.rejectedCode ?? null,
        rejectedMessage: patch.rejectedMessage ?? existing.rejectedMessage ?? null,
      });
    }
    await idbTransactionComplete(tx);
  }
}
