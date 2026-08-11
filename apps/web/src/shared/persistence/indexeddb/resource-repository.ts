import { AppError } from '@xiaohuang/domain-core';
import { idbRequest, idbTransactionComplete, STORE_RESOURCES } from './database.js';
import { computeContentHashSync } from './hash.js';
import { buildScopedKey } from './workspace-keys.js';

export type ResourceRecord = {
  scopedKey: string;
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  schemaVersion: number;
  revision: number;
  payload: unknown;
  contentHash: string;
  localOnly: boolean;
  updatedAt: number;
  deletedAt: number | null;
};

export type ResourceWriteInput = {
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  schemaVersion: number;
  revision: number;
  payload: unknown;
  localOnly: boolean;
  updatedAt: number;
  deletedAt?: number | null;
};

export function toResourceRecord(input: ResourceWriteInput): ResourceRecord {
  const deletedAt = input.deletedAt ?? null;
  const scopedKey = buildScopedKey(input.workspaceId, input.resourceType, input.resourceId);
  return {
    scopedKey,
    workspaceId: input.workspaceId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    schemaVersion: input.schemaVersion,
    revision: input.revision,
    payload: input.payload,
    contentHash: computeContentHashSync(input.payload),
    localOnly: input.localOnly,
    updatedAt: input.updatedAt,
    deletedAt,
  };
}

export function putResourceInTransaction(tx: IDBTransaction, record: ResourceRecord): void {
  tx.objectStore(STORE_RESOURCES).put(record);
}

export class ResourceRepository {
  constructor(private readonly db: IDBDatabase) {}

  async get(
    workspaceId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<ResourceRecord | null> {
    const scopedKey = buildScopedKey(workspaceId, resourceType, resourceId);
    const tx = this.db.transaction(STORE_RESOURCES, 'readonly');
    const record = await idbRequest<ResourceRecord | undefined>(
      tx.objectStore(STORE_RESOURCES).get(scopedKey),
    );
    await idbTransactionComplete(tx);
    return record ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<ResourceRecord[]> {
    const tx = this.db.transaction(STORE_RESOURCES, 'readonly');
    const index = tx.objectStore(STORE_RESOURCES).index('byWorkspace');
    const records = await idbRequest<ResourceRecord[]>(index.getAll(workspaceId));
    await idbTransactionComplete(tx);
    return records;
  }

  putInTransaction(tx: IDBTransaction, input: ResourceWriteInput): ResourceRecord {
    const record = toResourceRecord(input);
    putResourceInTransaction(tx, record);
    return record;
  }

  async put(input: ResourceWriteInput): Promise<ResourceRecord> {
    const tx = this.db.transaction(STORE_RESOURCES, 'readwrite');
    const record = this.putInTransaction(tx, input);
    try {
      await idbTransactionComplete(tx);
      return record;
    } catch (error) {
      throw error instanceof AppError
        ? error
        : new AppError('PERSISTENCE_WRITE', 'Failed to write resource', 'indexeddb');
    }
  }
}
