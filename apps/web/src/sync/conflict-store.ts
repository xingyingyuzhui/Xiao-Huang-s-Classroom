import type { ConflictRecord, ConflictResolution } from '@xiaohuang/sync-core';
import { idbRequest, idbTransactionComplete, STORE_META } from '../shared/persistence/indexeddb/idb-primitives.js';

export type ConflictSideSnapshot = {
  payload: unknown;
  revision: number | null;
  schemaVersion: number | null;
  summary?: string;
  deletedAt?: number | null;
};

export type StoredConflict = ConflictRecord & {
  operationId: string;
  workspaceId: string;
};

const META_KEY = 'syncConflicts';

type ConflictMetaRecord = {
  key: string;
  records: StoredConflict[];
};

function asStored(conflict: ConflictRecord | StoredConflict): StoredConflict {
  const extra = conflict as StoredConflict;
  return {
    ...conflict,
    operationId: extra.operationId ?? '',
    workspaceId: extra.workspaceId ?? '',
  };
}

/**
 * In-memory conflict registry with optional IndexedDB durability (meta store).
 * Resolved records stay persisted so a restart cannot resurrect them.
 */
export class ConflictStore {
  private conflicts = new Map<string, StoredConflict>();
  private db: IDBDatabase | null;

  constructor(db?: IDBDatabase | null) {
    this.db = db ?? null;
  }

  attach(db: IDBDatabase): void {
    this.db = db;
  }

  async hydrate(): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(STORE_META, 'readonly');
    const record = await idbRequest<ConflictMetaRecord | undefined>(
      tx.objectStore(STORE_META).get(META_KEY),
    );
    await idbTransactionComplete(tx);
    this.conflicts.clear();
    for (const conflict of record?.records ?? []) {
      this.conflicts.set(conflict.conflictId, asStored(conflict));
    }
  }

  add(conflict: ConflictRecord | StoredConflict): StoredConflict | null {
    const stored = asStored(conflict);
    const existing = this.conflicts.get(stored.conflictId);
    if (existing?.resolution != null) {
      return null;
    }
    if (existing && existing.resolution == null) {
      return existing;
    }
    this.conflicts.set(stored.conflictId, stored);
    void this.persist();
    return stored;
  }

  resolve(conflictId: string, resolution: ConflictResolution): StoredConflict | null {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict || conflict.resolution != null) return null;
    const resolved: StoredConflict = {
      ...conflict,
      resolution,
      resolvedAt: Date.now(),
    };
    this.conflicts.set(conflictId, resolved);
    void this.persist();
    return resolved;
  }

  listUnresolved(): StoredConflict[] {
    return [...this.conflicts.values()].filter((c) => c.resolution == null);
  }

  listAll(): StoredConflict[] {
    return [...this.conflicts.values()];
  }

  get(conflictId: string): StoredConflict | undefined {
    return this.conflicts.get(conflictId);
  }

  wasResolved(conflictId: string): boolean {
    const existing = this.conflicts.get(conflictId);
    return existing != null && existing.resolution != null;
  }

  clear(): void {
    this.conflicts.clear();
    void this.persist();
  }

  async flush(): Promise<void> {
    await this.persist();
  }

  private async persist(): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(STORE_META, 'readwrite');
    await idbRequest(
      tx.objectStore(STORE_META).put({
        key: META_KEY,
        records: this.listAll(),
      } satisfies ConflictMetaRecord),
    );
    await idbTransactionComplete(tx);
  }
}
