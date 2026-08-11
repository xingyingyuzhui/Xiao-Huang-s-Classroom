import { describe, test, expect, vi, beforeEach } from 'vitest';
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

    const deps = makeMockDeps({
      client: {
        syncPush: vi.fn(() => slowPush),
        syncPull: vi.fn(),
      },
    });

    const ctrl = new SyncController(deps);
    const syncPromise = ctrl.startSync();

    // Cancel while push is inflight
    ctrl.cancel();
    expect(deps.statusStore._status.phase).toBe('cancelled');

    // Resolve the push so the promise settles
    resolveSlowPush!({
      applied: [],
      rejected: [],
      conflicts: [],
      requestId: 'req',
    });

    await syncPromise;
  });
});
