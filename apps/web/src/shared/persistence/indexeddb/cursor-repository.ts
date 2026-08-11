import { AppError } from '@xiaohuang/domain-core';
import { idbRequest, idbTransactionComplete, STORE_CURSORS } from './database.js';

export type SyncCursorRecord = {
  workspaceId: string;
  token: string;
  sequence: number;
  updatedAt: number;
};

export class CursorRepository {
  constructor(private readonly db: IDBDatabase) {}

  async get(workspaceId: string): Promise<SyncCursorRecord | null> {
    const tx = this.db.transaction(STORE_CURSORS, 'readonly');
    const record = await idbRequest<SyncCursorRecord | undefined>(
      tx.objectStore(STORE_CURSORS).get(workspaceId),
    );
    await idbTransactionComplete(tx);
    return record ?? null;
  }

  putInTransaction(tx: IDBTransaction, record: SyncCursorRecord): void {
    tx.objectStore(STORE_CURSORS).put(record);
  }

  async put(record: SyncCursorRecord): Promise<void> {
    const tx = this.db.transaction(STORE_CURSORS, 'readwrite');
    this.putInTransaction(tx, record);
    try {
      await idbTransactionComplete(tx);
    } catch (error) {
      throw error instanceof AppError
        ? error
        : new AppError('PERSISTENCE_WRITE', 'Failed to write sync cursor', 'indexeddb');
    }
  }
}
