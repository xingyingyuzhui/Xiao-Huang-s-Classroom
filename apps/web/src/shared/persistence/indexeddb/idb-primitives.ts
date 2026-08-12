import { AppError } from '@xiaohuang/domain-core';

export const LOCAL_DB_NAME = 'xiaohuang-classroom-local';
export const LOCAL_DB_VERSION = 1;

export const STORE_META = 'meta';
export const STORE_RESOURCES = 'resources';
export const STORE_OUTBOX = 'outbox';
export const STORE_CURSORS = 'cursors';

export function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(request.error ?? new AppError('DATABASE_QUERY', 'IndexedDB request failed', 'indexeddb'));
    };
  });
}

export function idbTransactionComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      reject(tx.error ?? new AppError('DATABASE_QUERY', 'IndexedDB transaction failed', 'indexeddb'));
    };
    tx.onabort = () => {
      reject(tx.error ?? new AppError('DATABASE_QUERY', 'IndexedDB transaction aborted', 'indexeddb'));
    };
  });
}
