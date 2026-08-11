import { AppError } from '@xiaohuang/domain-core';
import { idbRequest, idbTransactionComplete, STORE_OUTBOX } from './database.js';

export type OutboxStatus = 'pending' | 'applied';

export type OutboxEntry = {
  operationId: string;
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  payload: unknown;
  baseRevision: number | null;
  createdAt: number;
  deletedAt: number | null;
  status: OutboxStatus;
  appliedAt: number | null;
};

export type OutboxAppendInput = {
  operationId: string;
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  payload: unknown;
  baseRevision: number | null;
  createdAt: number;
  deletedAt?: number | null;
};

export function appendOutboxInTransaction(tx: IDBTransaction, input: OutboxAppendInput): void {
  const entry: OutboxEntry = {
    operationId: input.operationId,
    workspaceId: input.workspaceId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    payload: input.payload,
    baseRevision: input.baseRevision,
    createdAt: input.createdAt,
    deletedAt: input.deletedAt ?? null,
    status: 'pending',
    appliedAt: null,
  };
  tx.objectStore(STORE_OUTBOX).put(entry);
}

export class OutboxRepository {
  constructor(private readonly db: IDBDatabase) {}

  appendInTransaction(tx: IDBTransaction, input: OutboxAppendInput): void {
    appendOutboxInTransaction(tx, input);
  }

  async listPending(workspaceId?: string): Promise<OutboxEntry[]> {
    const tx = this.db.transaction(STORE_OUTBOX, 'readonly');
    const store = tx.objectStore(STORE_OUTBOX);
    const all = await idbRequest<OutboxEntry[]>(store.getAll());
    await idbTransactionComplete(tx);
    return all
      .filter((entry) => entry.status === 'pending')
      .filter((entry) => (workspaceId ? entry.workspaceId === workspaceId : true))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async get(operationId: string): Promise<OutboxEntry | null> {
    const tx = this.db.transaction(STORE_OUTBOX, 'readonly');
    const entry = await idbRequest<OutboxEntry | undefined>(
      tx.objectStore(STORE_OUTBOX).get(operationId),
    );
    await idbTransactionComplete(tx);
    return entry ?? null;
  }

  async markApplied(operationId: string, appliedAt: number): Promise<void> {
    const tx = this.db.transaction(STORE_OUTBOX, 'readwrite');
    const store = tx.objectStore(STORE_OUTBOX);
    const existing = await idbRequest<OutboxEntry | undefined>(store.get(operationId));
    if (!existing) {
      throw new AppError('PERSISTENCE_WRITE', `Outbox operation not found: ${operationId}`, 'outbox');
    }
    if (existing.status === 'applied') {
      await idbTransactionComplete(tx);
      return;
    }
    await idbRequest(
      store.put({
        ...existing,
        status: 'applied',
        appliedAt,
      }),
    );
    await idbTransactionComplete(tx);
  }
}
