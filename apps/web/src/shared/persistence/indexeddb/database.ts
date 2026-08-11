import { AppError } from '@xiaohuang/domain-core';
import { runDataMigrations } from './migrations.js';
import type { MigrationDependencies } from './migrations.js';

export const LOCAL_DB_NAME = 'xiaohuang-classroom-local';
export const LOCAL_DB_VERSION = 1;

export const STORE_META = 'meta';
export const STORE_RESOURCES = 'resources';
export const STORE_OUTBOX = 'outbox';
export const STORE_CURSORS = 'cursors';

export type OpenLocalDatabaseOptions = MigrationDependencies & {
  factory?: IDBFactory;
};

function upgradeSchema(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion >= LOCAL_DB_VERSION) return;

  if (!db.objectStoreNames.contains(STORE_META)) {
    db.createObjectStore(STORE_META, { keyPath: 'key' });
  }

  if (!db.objectStoreNames.contains(STORE_RESOURCES)) {
    const resources = db.createObjectStore(STORE_RESOURCES, { keyPath: 'scopedKey' });
    resources.createIndex('byWorkspace', 'workspaceId', { unique: false });
  }

  if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
    const outbox = db.createObjectStore(STORE_OUTBOX, { keyPath: 'operationId' });
    outbox.createIndex('byWorkspaceStatus', ['workspaceId', 'status'], { unique: false });
  }

  if (!db.objectStoreNames.contains(STORE_CURSORS)) {
    db.createObjectStore(STORE_CURSORS, { keyPath: 'workspaceId' });
  }
}

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

/** Open local IndexedDB, apply schema upgrade and data migrations. */
export async function openLocalDatabase(options: OpenLocalDatabaseOptions = {}): Promise<IDBDatabase> {
  const factory = options.factory ?? globalThis.indexedDB;
  if (!factory) {
    throw new AppError('DATABASE_OPEN', 'IndexedDB is unavailable in this environment', 'indexeddb');
  }

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);
    request.onerror = () => {
      reject(
        request.error ??
          new AppError('DATABASE_OPEN', 'Failed to open local IndexedDB', 'indexeddb'),
      );
    };
    request.onupgradeneeded = (event) => {
      const database = request.result;
      upgradeSchema(database, event.oldVersion);
    };
    request.onsuccess = () => resolve(request.result);
  });

  await runDataMigrations(db, options);
  return db;
}

/** Delete the local database (tests and recovery flows). */
export async function deleteLocalDatabase(factory: IDBFactory = globalThis.indexedDB): Promise<void> {
  if (!factory) {
    throw new AppError('DATABASE_OPEN', 'IndexedDB is unavailable in this environment', 'indexeddb');
  }
  await idbRequest(factory.deleteDatabase(LOCAL_DB_NAME));
}
