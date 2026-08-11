import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installFakeIndexedDb } from '@xiaohuang/test-kit';
import root from '../helpers/repo-root.js';

async function load<T = unknown>(rel: string): Promise<T> {
  return import(pathToFileURL(path.join(root, rel)).href) as Promise<T>;
}

function sampleGraphDocument() {
  return {
    schemaVersion: 2 as const,
    functions: [
      {
        id: 'f1',
        name: 'quadratic',
        kind: 'preset' as const,
        preset: 'quadratic',
      },
    ],
    points: [],
    constructions: [],
  };
}

test('migrates legacy math graph document localStorage key into guest/default/math scope', async () => {
  const fake = installFakeIndexedDb();
  try {
    const { openLocalDatabase } = await load<{ openLocalDatabase: Function }>(
      'apps/web/src/shared/persistence/indexeddb/database.ts',
    );
    const { GRAPH_STORAGE_KEY, getDataMigrationVersion } = await load<{
      GRAPH_STORAGE_KEY: string;
      getDataMigrationVersion: (db: IDBDatabase) => Promise<number>;
    }>('apps/web/src/shared/persistence/indexeddb/migrations.ts');
    const { guestWorkspaceId } = await load<{ guestWorkspaceId: (subjectId: string) => string }>(
      'apps/web/src/shared/persistence/indexeddb/workspace-keys.ts',
    );
    const { ResourceRepository } = await load<{ ResourceRepository: new (db: IDBDatabase) => any }>(
      'apps/web/src/shared/persistence/indexeddb/resource-repository.ts',
    );
    const { OutboxRepository } = await load<{ OutboxRepository: new (db: IDBDatabase) => any }>(
      'apps/web/src/shared/persistence/indexeddb/outbox-repository.ts',
    );

    const legacyStorage = createMemoryStorage();
    legacyStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(sampleGraphDocument()));

    const db = await openLocalDatabase({ factory: fake.factory, legacyStorage, now: () => 1_700_000_000_000 });
    const workspaceId = guestWorkspaceId('math');
    const resources = new ResourceRepository(db);
    const outbox = new OutboxRepository(db);

    const migrated = await resources.get(workspaceId, 'math.graph-document', 'default');
    assert.ok(migrated);
    assert.equal(migrated.workspaceId, workspaceId);
    assert.equal(migrated.localOnly, true);
    assert.equal(migrated.schemaVersion, 2);
    assert.deepEqual(migrated.payload, sampleGraphDocument());
    assert.equal(legacyStorage.getItem(GRAPH_STORAGE_KEY), null);

    const pending = await outbox.listPending(workspaceId);
    assert.equal(pending.length, 0);

    assert.equal(await getDataMigrationVersion(db), 1);
    db.close();

    const reopened = await openLocalDatabase({ factory: fake.factory, legacyStorage, now: () => 1_700_000_000_001 });
    const again = await new ResourceRepository(reopened).listByWorkspace(workspaceId);
    assert.equal(again.length, 1);
    reopened.close();
  } finally {
    fake.restore();
  }
});

test('migration retains legacy source when payload is invalid', async () => {
  const fake = installFakeIndexedDb();
  try {
    const { openLocalDatabase } = await load<{ openLocalDatabase: Function }>(
      'apps/web/src/shared/persistence/indexeddb/database.ts',
    );
    const { GRAPH_STORAGE_KEY } = await load<{ GRAPH_STORAGE_KEY: string }>(
      'apps/web/src/shared/persistence/indexeddb/migrations.ts',
    );
    const { errorCodeOf } = await load<{ errorCodeOf: (e: unknown) => string }>(
      'packages/domain-core/src/index.ts',
    );

    const legacyStorage = createMemoryStorage();
    legacyStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify({ schemaVersion: 2, functions: [] }));

    await assert.rejects(
      () => openLocalDatabase({ factory: fake.factory, legacyStorage }),
      (error: unknown) => {
        const code = (error as { code?: string }).code ?? errorCodeOf(error);
        assert.equal(code, 'PERSISTENCE_MIGRATION');
        return true;
      },
    );

    assert.ok(legacyStorage.getItem(GRAPH_STORAGE_KEY));
  } finally {
    fake.restore();
  }
});

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}
