import { describe, test, expect, vi } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

async function load<T = unknown>(rel: string): Promise<T> {
  return import(pathToFileURL(path.join(root, rel)).href) as Promise<T>;
}

describe('ResourceRegistry', () => {
  test('registers and retrieves type configs', async () => {
    const { ResourceRegistry } = await load<any>('apps/web/src/sync/resource-registry.ts');
    const registry = new ResourceRegistry();

    const config = {
      resourceType: 'graph',
      schemaVersion: 1,
      maxPayloadBytes: 1024,
      supportsDuplicateLocal: false,
      summarize: () => 'graph',
      computeHash: () => 'abc',
    };

    registry.register(config);
    expect(registry.has('graph')).toBe(true);
    expect(registry.get('graph')).toBe(config);
    expect(registry.has('unknown')).toBe(false);
    expect(registry.listRegistered()).toEqual(['graph']);
  });
});

describe('SyncStatusStore', () => {
  test('notifies listeners on update', async () => {
    const { SyncStatusStore } = await load<any>('apps/web/src/sync/sync-status-store.ts');
    const store = new SyncStatusStore();

    const received: unknown[] = [];
    store.subscribe((status: unknown) => received.push(status));

    store.update({ phase: 'pushing' });
    expect(received).toHaveLength(1);
    expect((received[0] as any).phase).toBe('pushing');

    const unsub = store.subscribe(() => {});
    unsub();
    store.update({ phase: 'pulling' });
    expect(received).toHaveLength(2);
  });

  test('returns copy from getStatus', async () => {
    const { SyncStatusStore } = await load<any>('apps/web/src/sync/sync-status-store.ts');
    const store = new SyncStatusStore();
    const a = store.getStatus();
    const b = store.getStatus();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe('ConflictStore', () => {
  test('add/resolve/listUnresolved', async () => {
    const { ConflictStore } = await load<any>('apps/web/src/sync/conflict-store.ts');
    const store = new ConflictStore();

    const conflict = {
      conflictId: 'c1',
      resourceType: 'graph',
      resourceId: 'r1',
      snapshot: { local: {}, cloud: {}, base: null },
      supportsDuplicateLocal: false,
      resolvedAt: null,
      resolution: null,
    };

    store.add(conflict);
    expect(store.listUnresolved()).toHaveLength(1);
    expect(store.get('c1')).toBeTruthy();

    const resolved = store.resolve('c1', 'keepLocal');
    expect(resolved).toBeTruthy();
    expect(resolved!.resolution).toBe('keepLocal');
    expect(store.listUnresolved()).toHaveLength(0);

    // Already resolved
    expect(store.resolve('c1', 'keepCloud')).toBeNull();

    store.clear();
    expect(store.get('c1')).toBeUndefined();
  });
});

describe('CloudClient', () => {
  test('syncPush sends POST with auth header', async () => {
    const { CloudClient } = await load<any>('apps/web/src/shared/api/cloud-client.ts');

    const mockResponse = {
      success: true,
      data: { applied: ['op1'], rejected: [], conflicts: [], requestId: 'req1' },
      requestId: 'req1',
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    try {
      const client = new CloudClient({
        baseUrl: 'http://localhost:3000',
        getAccessToken: () => 'tok123',
      });

      const result = await client.syncPush('ws1', []);
      expect(result.applied).toEqual(['op1']);

      const call = (globalThis.fetch as any).mock.calls[0];
      expect(call[0]).toContain('/push');
      expect(call[1].headers['Authorization']).toBe('Bearer tok123');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('401 triggers onUnauthorized', async () => {
    const { CloudClient } = await load<any>('apps/web/src/shared/api/cloud-client.ts');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 401,
      json: () => Promise.resolve({ success: false, error: { code: 'AUTH_UNAUTHORIZED', message: 'bad' }, requestId: 'r' }),
    });

    const onUnauth = vi.fn();
    try {
      const client = new CloudClient({
        baseUrl: 'http://localhost:3000',
        getAccessToken: () => null,
        onUnauthorized: onUnauth,
      });

      await expect(client.syncPush('ws1', [])).rejects.toThrow();
      expect(onUnauth).toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('SyncController', () => {
  function makeMockDeps(overrides: Record<string, any> = {}) {
    return {
      client: {
        syncPush: vi.fn().mockResolvedValue({
          applied: ['op1'],
          rejected: [],
          conflicts: [],
          requestId: 'req1',
        }),
        syncPull: vi.fn().mockResolvedValue({
          cursor: 'cur1',
          sequence: 1,
          changes: [],
          hasMore: false,
          requestId: 'req2',
        }),
      },
      statusStore: {
        _status: { phase: 'idle' },
        getStatus() { return { ...this._status }; },
        update(partial: any) { Object.assign(this._status, partial); },
        subscribe: vi.fn(() => () => {}),
      },
      conflictStore: {
        add: vi.fn(),
        resolve: vi.fn(),
        listUnresolved: vi.fn(() => []),
        get: vi.fn(),
        clear: vi.fn(),
        wasResolved: vi.fn(() => false),
      },
      registry: {
        get: vi.fn(() => ({ schemaVersion: 1, computeHash: () => 'hash' })),
        has: vi.fn(() => true),
      },
      contextStore: {
        getContext: vi.fn(() => ({
          mode: 'guest',
          accountId: null,
          classId: null,
          subjectId: 'chemistry',
          workspaceId: 'ws_guest_chem',
          kind: 'guest',
          deviceId: 'dev1',
          generation: 0,
        })),
      },
      getOutboxOperations: vi.fn(async () => [
        {
          operationId: 'op1',
          resourceType: 'graph',
          resourceId: 'r1',
          payload: { x: 1 },
          baseRevision: null,
          deletedAt: null,
        },
      ]),
      ackOutboxOperations: vi.fn(async () => {}),
      applyPulledChanges: vi.fn(async () => {}),
      saveCursor: vi.fn(async () => {}),
      loadCursor: vi.fn(async () => null),
      ...overrides,
    };
  }

  test('starts push then pull on startSync', async () => {
    const { SyncController } = await load<any>('apps/web/src/sync/sync-controller.ts');
    const deps = makeMockDeps();
    const ctrl = new SyncController(deps);

    await ctrl.startSync();

    expect(deps.statusStore._status.lastError).toBeNull();
    expect(deps.client.syncPush).toHaveBeenCalled();
    expect(deps.ackOutboxOperations).toHaveBeenCalledWith(['op1']);
    expect(deps.client.syncPull).toHaveBeenCalled();
    expect(deps.statusStore._status.phase).toBe('completed');
  });

  test('stops at conflict phase when push returns conflicts', async () => {
    const { SyncController } = await load<any>('apps/web/src/sync/sync-controller.ts');
    const deps = makeMockDeps({
      client: {
        syncPush: vi.fn().mockResolvedValue({
          applied: [],
          rejected: [],
          conflicts: [
            {
              operationId: 'op1',
              conflict: {
                resourceType: 'graph',
                resourceId: 'r1',
                localSummary: 'local',
                cloudSummary: 'cloud',
                baseSummary: null,
              },
            },
          ],
          requestId: 'req1',
        }),
        syncPull: vi.fn(),
      },
    });

    const ctrl = new SyncController(deps);
    await ctrl.startSync();

    expect(deps.statusStore._status.phase).toBe('conflict');
    expect(deps.conflictStore.add).toHaveBeenCalled();
    expect(deps.client.syncPull).not.toHaveBeenCalled();
  });

  test('cancel aborts inflight and sets cancelled status', async () => {
    const { SyncController } = await load<any>('apps/web/src/sync/sync-controller.ts');

    let resolveSlowPush: (v: any) => void;
    const slowPush = new Promise((r) => { resolveSlowPush = r; });

    const revertInflightOutbox = vi.fn(async () => {});
    const deps = makeMockDeps({
      client: {
        syncPush: vi.fn(() => slowPush),
        syncPull: vi.fn(),
      },
      revertInflightOutbox,
    });

    const ctrl = new SyncController(deps);
    const syncPromise = ctrl.startSync();

    ctrl.cancel();
    expect(deps.statusStore._status.phase).toBe('cancelled');

    resolveSlowPush!({
      applied: [],
      rejected: [],
      conflicts: [],
      requestId: 'req',
    });

    await syncPromise;
    expect(deps.statusStore._status.phase).toBe('cancelled');
    expect(revertInflightOutbox).toHaveBeenCalled();
    expect(deps.client.syncPull).not.toHaveBeenCalled();
  });

  test('mixed applied/conflict/rejected does not mark completed', async () => {
    const { SyncController } = await load<any>('apps/web/src/sync/sync-controller.ts');
    const deps = makeMockDeps({
      getOutboxOperations: vi.fn(async () => [
        { operationId: 'op-applied', resourceType: 'graph', resourceId: 'r1', payload: { a: 1 }, baseRevision: null, deletedAt: null },
        { operationId: 'op-conflict', resourceType: 'graph', resourceId: 'r2', payload: { a: 2 }, baseRevision: 1, deletedAt: null },
        { operationId: 'op-rejected', resourceType: 'graph', resourceId: 'r3', payload: { a: 3 }, baseRevision: null, deletedAt: null },
      ]),
      client: {
        syncPush: vi.fn().mockResolvedValue({
          applied: ['op-applied'],
          rejected: [{ operationId: 'op-rejected', code: 'VALIDATION_SCHEMA', message: 'bad' }],
          conflicts: [
            {
              operationId: 'op-conflict',
              conflict: {
                resourceType: 'graph',
                resourceId: 'r2',
                localSummary: 'revision:2',
                cloudSummary: 'revision:4',
                baseSummary: 'revision:1',
                cloudRevision: 4,
                cloudSchemaVersion: 1,
                cloudPayload: { cloud: true },
                cloudDeletedAt: null,
              },
            },
          ],
          requestId: 'req1',
        }),
        syncPull: vi.fn(),
      },
    });

    const ctrl = new SyncController(deps);
    await ctrl.startSync();

    expect(deps.ackOutboxOperations).toHaveBeenCalledWith(['op-applied']);
    expect(deps.statusStore._status.phase).toBe('conflict');
    expect(deps.statusStore._status.phase).not.toBe('completed');
    expect(deps.client.syncPull).not.toHaveBeenCalled();
    expect(deps.conflictStore.add).toHaveBeenCalled();
    const added = deps.conflictStore.add.mock.calls[0][0];
    expect(added.snapshot.local.payload).toEqual({ a: 2 });
    expect(added.snapshot.cloud.payload).toEqual({ cloud: true });
    expect(added.snapshot.cloud.revision).toBe(4);
    expect(added.snapshot.base).not.toBeNull();
  });

  test('rejected without conflict pulls then fails (not completed)', async () => {
    const { SyncController } = await load<any>('apps/web/src/sync/sync-controller.ts');
    const deps = makeMockDeps({
      client: {
        syncPush: vi.fn().mockResolvedValue({
          applied: [],
          rejected: [{ operationId: 'op1', code: 'SYNC_HASH_MISMATCH', message: 'hash' }],
          conflicts: [],
          requestId: 'req1',
        }),
        syncPull: vi.fn().mockResolvedValue({
          cursor: '1',
          sequence: 1,
          changes: [],
          hasMore: false,
          requestId: 'req2',
        }),
      },
    });

    const ctrl = new SyncController(deps);
    await ctrl.startSync();

    expect(deps.client.syncPull).toHaveBeenCalled();
    expect(deps.statusStore._status.phase).toBe('failed');
    expect(deps.statusStore._status.lastError).toMatch(/拒绝/);
  });

  test('pendingCount is re-read from outbox, never hardcoded 0', async () => {
    const { SyncController } = await load<any>('apps/web/src/sync/sync-controller.ts');
    const countPendingOutbox = vi.fn(async () => 2);
    const deps = makeMockDeps({ countPendingOutbox });

    const ctrl = new SyncController(deps);
    await ctrl.startSync();

    expect(countPendingOutbox).toHaveBeenCalled();
    expect(deps.statusStore._status.phase).toBe('completed');
    expect(deps.statusStore._status.pendingCount).toBe(2);
  });

  test('empty outbox still pulls', async () => {
    const { SyncController } = await load<any>('apps/web/src/sync/sync-controller.ts');
    const deps = makeMockDeps({
      getOutboxOperations: vi.fn(async () => []),
    });

    const ctrl = new SyncController(deps);
    await ctrl.startSync();

    expect(deps.client.syncPush).not.toHaveBeenCalled();
    expect(deps.client.syncPull).toHaveBeenCalled();
    expect(deps.statusStore._status.phase).toBe('completed');
  });

  test('push HTTP success + handlePushResponse throw still acks applied and pulls', async () => {
    const { SyncController } = await load<any>('apps/web/src/sync/sync-controller.ts');
    const deps = makeMockDeps({
      client: {
        syncPush: vi.fn().mockResolvedValue({
          // ghost id is not in the in-memory outbox → handlePushResponse throws
          applied: ['op1', 'ghost-op'],
          rejected: [],
          conflicts: [],
          requestId: 'req1',
        }),
        syncPull: vi.fn().mockResolvedValue({
          cursor: '1',
          sequence: 1,
          changes: [],
          hasMore: false,
          requestId: 'req2',
        }),
      },
    });

    const ctrl = new SyncController(deps);
    await ctrl.startSync();
    expect(deps.ackOutboxOperations).toHaveBeenCalledWith(['op1', 'ghost-op']);
    expect(deps.client.syncPull).toHaveBeenCalled();
    expect(deps.statusStore._status.phase).toBe('completed');
  });
});

describe('durable ConflictStore', () => {
  test('resolved conflicts survive hydrate and are not resurrected', async () => {
    const { installFakeIndexedDb } = await load<any>('packages/test-kit/src/fake-indexeddb.ts');
    const fake = installFakeIndexedDb();
    try {
      const { openLocalDatabase } = await load<any>('apps/web/src/shared/persistence/indexeddb/database.ts');
      const { ConflictStore } = await load<any>('apps/web/src/sync/conflict-store.ts');
      const db = await openLocalDatabase({ factory: fake.factory });
      const store = new ConflictStore(db);
      store.add({
        conflictId: 'graph:r1:op-1',
        operationId: 'op-1',
        workspaceId: 'ws-1',
        resourceType: 'graph',
        resourceId: 'r1',
        snapshot: {
          local: { payload: { local: 1 }, revision: 1, schemaVersion: 1 },
          cloud: { payload: { cloud: 1 }, revision: 2, schemaVersion: 1 },
          base: null,
        },
        supportsDuplicateLocal: false,
        resolvedAt: null,
        resolution: null,
      });
      store.resolve('graph:r1:op-1', 'keepLocal');
      await store.flush();

      const restored = new ConflictStore(db);
      await restored.hydrate();
      expect(restored.listUnresolved()).toHaveLength(0);
      expect(restored.wasResolved('graph:r1:op-1')).toBe(true);
      expect(restored.add({
        conflictId: 'graph:r1:op-1',
        operationId: 'op-1',
        workspaceId: 'ws-1',
        resourceType: 'graph',
        resourceId: 'r1',
        snapshot: { local: null, cloud: null, base: null },
        supportsDuplicateLocal: false,
        resolvedAt: null,
        resolution: null,
      })).toBeNull();
      db.close();
    } finally {
      fake.restore();
    }
  });
});

describe('conflict resolution persistence', () => {
  test('keepLocal enqueues a new op on the latest cloud revision', async () => {
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

      await service.applyConflictResolution({
        conflict: {
          conflictId: 'class.roster:roster-1:op-old',
          operationId: 'op-old',
          workspaceId: 'ws-1',
          resourceType: 'class.roster',
          resourceId: 'roster-1',
          snapshot: {
            local: { payload: { students: [{ name: 'A' }] }, revision: 1, schemaVersion: 1 },
            cloud: { payload: { students: [{ name: 'B' }] }, revision: 4, schemaVersion: 1 },
            base: { payload: null, revision: 1, schemaVersion: 1 },
          },
          supportsDuplicateLocal: true,
          resolvedAt: null,
          resolution: null,
        },
        resolution: 'keepLocal',
        createOperationId: () => 'op-new',
        now: 2000,
      });

      expect((await service.outbox.get('op-old')).status).toBe('applied');
      const pending = await service.outbox.listPending('ws-1');
      expect(pending).toHaveLength(1);
      expect(pending[0].operationId).toBe('op-new');
      expect(pending[0].baseRevision).toBe(4);
      expect(pending[0].payload).toEqual({ students: [{ name: 'A' }] });
      db.close();
    } finally {
      fake.restore();
    }
  });
});

describe('OutboxRepository statuses', () => {
  test('inflight reverts to pending and applied stays applied', async () => {
    const { installFakeIndexedDb } = await load<any>('packages/test-kit/src/fake-indexeddb.ts');
    const fake = installFakeIndexedDb();
    try {
      const { openLocalDatabase } = await load<any>('apps/web/src/shared/persistence/indexeddb/database.ts');
      const { OutboxRepository } = await load<any>(
        'apps/web/src/shared/persistence/indexeddb/outbox-repository.ts',
      );
      const db = await openLocalDatabase({ factory: fake.factory });
      const outbox = new OutboxRepository(db);
      await outbox.append({
        operationId: 'op-a',
        workspaceId: 'ws-1',
        resourceType: 'graph',
        resourceId: 'r1',
        payload: { n: 1 },
        baseRevision: null,
        createdAt: 1,
      });

      await outbox.markInflight(['op-a']);
      expect((await outbox.get('op-a')).status).toBe('inflight');
      expect(await outbox.countPending('ws-1')).toBe(1);

      await outbox.revertInflightToPending('ws-1');
      expect((await outbox.get('op-a')).status).toBe('pending');

      await outbox.markApplied('op-a', 99);
      expect((await outbox.get('op-a')).status).toBe('applied');
      expect(await outbox.countPending('ws-1')).toBe(0);
      db.close();
    } finally {
      fake.restore();
    }
  });
});
