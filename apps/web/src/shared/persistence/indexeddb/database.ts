import { AppError } from '@xiaohuang/domain-core';
import { runDataMigrations } from './migrations.js';
import type { MigrationDependencies } from './migrations.js';
import {
  LOCAL_DB_NAME,
  LOCAL_DB_VERSION,
  STORE_CURSORS,
  STORE_META,
  STORE_OUTBOX,
  STORE_RESOURCES,
  idbRequest,
} from './idb-primitives.js';

export {
  LOCAL_DB_NAME,
  LOCAL_DB_VERSION,
  STORE_META,
  STORE_RESOURCES,
  STORE_OUTBOX,
  STORE_CURSORS,
  idbRequest,
  idbTransactionComplete,
} from './idb-primitives.js';

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
