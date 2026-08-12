import {
  GRAPH_DOCUMENT_VERSION,
  graphDocumentSchema,
} from '@xiaohuang/contracts';
import { AppError } from '@xiaohuang/domain-core';
import {
  idbRequest,
  idbTransactionComplete,
  STORE_META,
  STORE_RESOURCES,
} from './idb-primitives.js';
import { computeContentHashSync } from './hash.js';
import { buildScopedKey, guestWorkspaceId } from './workspace-keys.js';
import type { ResourceRecord } from './resource-repository.js';
import { putResourceInTransaction } from './resource-repository.js';

export const GRAPH_STORAGE_KEY = 'xiaohuang:math:graph-document:v2';

export type MigrationDependencies = {
  legacyStorage?: Pick<Storage, 'getItem' | 'removeItem'> | undefined;
  now?: () => number;
};

export type MigrationContext = {
  db: IDBDatabase;
  legacyStorage?: Pick<Storage, 'getItem' | 'removeItem'> | undefined;
  now?: () => number;
};

export type DataMigration = {
  version: number;
  marker: string;
  run: (ctx: MigrationContext) => Promise<void>;
  postcondition: (ctx: MigrationContext) => Promise<boolean>;
  finalize?: (ctx: MigrationContext) => Promise<void>;
};

type MigrationMarkerRecord = {
  key: string;
  version: number;
  marker: string;
  sourceHash: string;
  completedAt: number;
};

const META_DATA_MIGRATION_VERSION = 'dataMigrationVersion';

async function readMetaNumber(db: IDBDatabase, key: string): Promise<number> {
  const tx = db.transaction(STORE_META, 'readonly');
  const store = tx.objectStore(STORE_META);
  const row = await idbRequest<{ key: string; value: number } | undefined>(store.get(key));
  await idbTransactionComplete(tx);
  return row?.value ?? 0;
}

async function writeMetaNumber(db: IDBDatabase, key: string, value: number): Promise<void> {
  const tx = db.transaction(STORE_META, 'readwrite');
  tx.objectStore(STORE_META).put({ key, value });
  await idbTransactionComplete(tx);
}

async function readMigrationMarker(
  db: IDBDatabase,
  version: number,
): Promise<MigrationMarkerRecord | null> {
  const tx = db.transaction(STORE_META, 'readonly');
  const store = tx.objectStore(STORE_META);
  const row = await idbRequest<MigrationMarkerRecord | undefined>(
    store.get(`migration:${version}`),
  );
  await idbTransactionComplete(tx);
  return row ?? null;
}

async function writeMigrationMarker(
  db: IDBDatabase,
  marker: MigrationMarkerRecord,
): Promise<void> {
  const tx = db.transaction(STORE_META, 'readwrite');
  tx.objectStore(STORE_META).put(marker);
  await idbTransactionComplete(tx);
}

async function getResourceByScopedKey(
  db: IDBDatabase,
  scopedKey: string,
): Promise<ResourceRecord | null> {
  const tx = db.transaction(STORE_RESOURCES, 'readonly');
  const record = await idbRequest<ResourceRecord | undefined>(
    tx.objectStore(STORE_RESOURCES).get(scopedKey),
  );
  await idbTransactionComplete(tx);
  return record ?? null;
}

async function migrateMathGraphDocument(ctx: MigrationContext): Promise<void> {
  const legacyStorage = ctx.legacyStorage;
  if (!legacyStorage) return;

  const raw = legacyStorage.getItem(GRAPH_STORAGE_KEY);
  if (!raw) return;

  const workspaceId = guestWorkspaceId('math');
  const resourceType = 'math.graph-document';
  const resourceId = 'default';
  const scopedKey = buildScopedKey(workspaceId, resourceType, resourceId);
  const existing = await getResourceByScopedKey(ctx.db, scopedKey);
  if (existing) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError(
      'PERSISTENCE_MIGRATION',
      `Legacy graph document at ${GRAPH_STORAGE_KEY} is corrupt JSON`,
      'indexeddb',
    );
  }

  const validated = graphDocumentSchema.safeParse(parsed);
  if (!validated.success) {
    throw new AppError(
      'PERSISTENCE_MIGRATION',
      `Legacy graph document failed schema validation: ${validated.error.message}`,
      'indexeddb',
    );
  }

  const now = ctx.now?.() ?? Date.now();
  const record: ResourceRecord = {
    scopedKey,
    workspaceId,
    resourceType,
    resourceId,
    schemaVersion: GRAPH_DOCUMENT_VERSION,
    revision: 0,
    payload: validated.data,
    contentHash: computeContentHashSync(validated.data),
    localOnly: true,
    updatedAt: now,
    deletedAt: null,
  };

  const tx = ctx.db.transaction(STORE_RESOURCES, 'readwrite');
  putResourceInTransaction(tx, record);
  await idbTransactionComplete(tx);
}

async function finalizeMathGraphDocument(ctx: MigrationContext): Promise<void> {
  ctx.legacyStorage?.removeItem(GRAPH_STORAGE_KEY);
}

async function migrationMathGraphDocumentPostcondition(ctx: MigrationContext): Promise<boolean> {
  const raw = ctx.legacyStorage?.getItem(GRAPH_STORAGE_KEY);
  if (!raw) {
    return true;
  }

  const workspaceId = guestWorkspaceId('math');
  const scopedKey = buildScopedKey(workspaceId, 'math.graph-document', 'default');
  const migrated = await getResourceByScopedKey(ctx.db, scopedKey);
  if (!migrated) return false;
  if (!migrated.localOnly) return false;
  const validated = graphDocumentSchema.safeParse(migrated.payload);
  if (!validated.success) return false;
  return migrated.schemaVersion === GRAPH_DOCUMENT_VERSION;
}

export const DATA_MIGRATIONS: DataMigration[] = [
  {
    version: 1,
    marker: 'math-graph-document-v2',
    run: migrateMathGraphDocument,
    postcondition: migrationMathGraphDocumentPostcondition,
    finalize: finalizeMathGraphDocument,
  },
];

export async function runDataMigrations(
  db: IDBDatabase,
  deps: MigrationDependencies = {},
): Promise<void> {
  const ctx: MigrationContext = {
    db,
    now: deps.now ?? (() => Date.now()),
    ...(deps.legacyStorage ? { legacyStorage: deps.legacyStorage } : {}),
  };

  let currentVersion = await readMetaNumber(db, META_DATA_MIGRATION_VERSION);

  for (const migration of DATA_MIGRATIONS) {
    if (migration.version <= currentVersion) continue;

    const existingMarker = await readMigrationMarker(db, migration.version);
    if (existingMarker?.marker === migration.marker) {
      currentVersion = migration.version;
      continue;
    }

    await migration.run(ctx);
    const ok = await migration.postcondition(ctx);
    if (!ok) {
      throw new AppError(
        'PERSISTENCE_MIGRATION',
        `Migration ${migration.version} (${migration.marker}) postcondition failed`,
        'indexeddb',
      );
    }

    if (migration.finalize) {
      await migration.finalize(ctx);
    }

    const sourceHash = computeContentHashSync({
      marker: migration.marker,
      version: migration.version,
    });

    await writeMigrationMarker(db, {
      key: `migration:${migration.version}`,
      version: migration.version,
      marker: migration.marker,
      sourceHash,
      completedAt: ctx.now?.() ?? Date.now(),
    });
    await writeMetaNumber(db, META_DATA_MIGRATION_VERSION, migration.version);
    currentVersion = migration.version;
  }
}

export async function getDataMigrationVersion(db: IDBDatabase): Promise<number> {
  return readMetaNumber(db, META_DATA_MIGRATION_VERSION);
}
