import { describe, expect, test, vi } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

async function load<T = unknown>(rel: string): Promise<T> {
  return import(pathToFileURL(path.join(root, rel)).href) as Promise<T>;
}

describe('atomic conflict resolution', () => {
  test('keepLocal updates resource and enqueues outbox in one transaction', async () => {
    const { installFakeIndexedDb } = await load<any>('packages/test-kit/src/fake-indexeddb.ts');
    const fake = installFakeIndexedDb();
    try {
      const { openLocalDatabase } = await load<any>('apps/web/src/shared/persistence/indexeddb/database.ts');
      const { LocalResourceService } = await load<any>('apps/web/src/sync/local-resource-service.ts');
      const db = await openLocalDatabase({ factory: fake.factory });
      const service = new LocalResourceService({ db, generation: 0, now: () => 1000 });
      await service.write({
        workspaceId: 'ws-1',
        resourceType: 'class.roster',
        resourceId: 'roster-1',
        schemaVersion: 1,
        revision: 1,
        payload: { students: [{ name: 'A' }] },
        localOnly: false,
        operationId: 'op-old',
        baseRevision: 1,
      });
      await service.outbox.updateStatuses([{ operationId: 'op-old', status: 'conflict' }]);

      await service.resolveConflictAtomically({
        conflict: {
          conflictId: 'class.roster:roster-1:op-old',
          operationId: 'op-old',
          workspaceId: 'ws-1',
          resourceType: 'class.roster',
          resourceId: 'roster-1',
          snapshot: {
            local: { payload: { students: [{ name: 'A' }] }, revision: 1, schemaVersion: 1 },
            cloud: { payload: { students: [{ name: 'B' }] }, revision: 4, schemaVersion: 1 },
            base: { payload: { students: [{ name: 'A' }] }, revision: 1, schemaVersion: 1 },
          },
          supportsDuplicateLocal: true,
          resolvedAt: null,
          resolution: null,
        },
        resolution: 'keepLocal',
        nextOperationId: 'op-new',
        now: 2000,
      });

      const resource = await service.resources.get('ws-1', 'class.roster', 'roster-1');
      expect(resource?.revision).toBe(5);
      expect((await service.outbox.get('op-old'))?.status).toBe('applied');
      const pending = await service.outbox.listPending('ws-1');
      expect(pending).toHaveLength(1);
      expect(pending[0].operationId).toBe('op-new');
      expect(pending[0].baseRevision).toBe(4);
      expect(pending[0].basePayload).toEqual({ students: [{ name: 'B' }] });
      db.close();
    } finally {
      fake.restore();
    }
  });

  test('aborted transaction leaves resource and outbox unchanged', async () => {
    const { installFakeIndexedDb } = await load<any>('packages/test-kit/src/fake-indexeddb.ts');
    const fake = installFakeIndexedDb();
    try {
      const { openLocalDatabase } = await load<any>('apps/web/src/shared/persistence/indexeddb/database.ts');
      const { LocalResourceService } = await load<any>('apps/web/src/sync/local-resource-service.ts');
      const { STORE_META, STORE_OUTBOX, STORE_RESOURCES } = await load<any>(
        'apps/web/src/shared/persistence/indexeddb/idb-primitives.ts',
      );
      const db = await openLocalDatabase({ factory: fake.factory });
      const service = new LocalResourceService({ db, generation: 0, now: () => 1000 });
      await service.write({
        workspaceId: 'ws-1',
        resourceType: 'class.roster',
        resourceId: 'roster-1',
        schemaVersion: 1,
        revision: 1,
        payload: { students: [{ name: 'A' }] },
        localOnly: false,
        operationId: 'op-old',
        baseRevision: 1,
      });
      await service.outbox.updateStatuses([{ operationId: 'op-old', status: 'conflict' }]);

      const originalTransaction = db.transaction.bind(db);
      const transactionSpy = vi.spyOn(db, 'transaction').mockImplementation((storeNames, mode) => {
        const tx = originalTransaction(storeNames, mode);
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        const isResolveTx =
          names.includes(STORE_RESOURCES) &&
          names.includes(STORE_OUTBOX) &&
          names.includes(STORE_META);
        if (!isResolveTx) {
          return tx;
        }
        const originalObjectStore = tx.objectStore.bind(tx);
        tx.objectStore = ((name: string) => {
          const store = originalObjectStore(name);
          if (name !== STORE_RESOURCES) {
            return store;
          }
          store.put = (() => {
            throw new DOMException('Injected resource write failure', 'AbortError');
          }) as typeof store.put;
          return store;
        }) as typeof tx.objectStore;
        return tx;
      });

      await expect(
        service.resolveConflictAtomically({
          conflict: {
            conflictId: 'class.roster:roster-1:op-old',
            operationId: 'op-old',
            workspaceId: 'ws-1',
            resourceType: 'class.roster',
            resourceId: 'roster-1',
            snapshot: {
              local: { payload: { students: [{ name: 'A' }] }, revision: 1, schemaVersion: 1 },
              cloud: { payload: { students: [{ name: 'B' }] }, revision: 4, schemaVersion: 1 },
              base: null,
            },
            supportsDuplicateLocal: true,
            resolvedAt: null,
            resolution: null,
          },
          resolution: 'duplicateLocal',
          nextOperationId: 'op-new',
          now: 2000,
        }),
      ).rejects.toThrow();
      transactionSpy.mockRestore();

      const resource = await service.resources.get('ws-1', 'class.roster', 'roster-1');
      expect(resource?.revision).toBe(1);
      expect((await service.outbox.get('op-old'))?.status).toBe('conflict');
      expect(await service.outbox.listPending('ws-1')).toHaveLength(0);
      db.close();
    } finally {
      fake.restore();
    }
  });

  test('duplicate resolve is idempotent', async () => {
    const { installFakeIndexedDb } = await load<any>('packages/test-kit/src/fake-indexeddb.ts');
    const fake = installFakeIndexedDb();
    try {
      const { openLocalDatabase } = await load<any>('apps/web/src/shared/persistence/indexeddb/database.ts');
      const { LocalResourceService } = await load<any>('apps/web/src/sync/local-resource-service.ts');
      const { ConflictStore } = await load<any>('apps/web/src/sync/conflict-store.ts');
      const db = await openLocalDatabase({ factory: fake.factory });
      const service = new LocalResourceService({ db, generation: 0, now: () => 1000 });
      const conflictStore = new ConflictStore(db);
      await conflictStore.hydrate();

      const conflict = {
        conflictId: 'class.roster:roster-1:op-old',
        operationId: 'op-old',
        workspaceId: 'ws-1',
        resourceType: 'class.roster',
        resourceId: 'roster-1',
        snapshot: {
          local: { payload: { students: [{ name: 'A' }] }, revision: 1, schemaVersion: 1 },
          cloud: { payload: { students: [{ name: 'B' }] }, revision: 4, schemaVersion: 1 },
          base: null,
        },
        supportsDuplicateLocal: false,
        resolvedAt: null,
        resolution: null,
      };
      conflictStore.add(conflict);
      await conflictStore.flush();

      await service.write({
        workspaceId: 'ws-1',
        resourceType: 'class.roster',
        resourceId: 'roster-1',
        schemaVersion: 1,
        revision: 1,
        payload: { students: [{ name: 'A' }] },
        localOnly: false,
        operationId: 'op-old',
        baseRevision: 1,
      });
      await service.outbox.updateStatuses([{ operationId: 'op-old', status: 'conflict' }]);

      const input = {
        conflict,
        resolution: 'keepCloud' as const,
        nextOperationId: 'op-unused',
        now: 2000,
      };
      await service.resolveConflictAtomically(input);
      await service.resolveConflictAtomically(input);

      expect(await service.outbox.listPending('ws-1')).toHaveLength(0);
      const resource = await service.resources.get('ws-1', 'class.roster', 'roster-1');
      expect(resource?.payload).toEqual({ students: [{ name: 'B' }] });
      db.close();
    } finally {
      fake.restore();
    }
  });
});
