/**
 * IndexedDB / outbox / cursor / SyncController wiring for account cloud.
 * Core sync path must not depend on DOM.
 */
import { SyncController } from '../sync/sync-controller.js';
import { LocalResourceService } from '../sync/local-resource-service.js';
import { openLocalDatabase } from '../shared/persistence/indexeddb/database.js';
import { OutboxRepository } from '../shared/persistence/indexeddb/outbox-repository.js';
import { CursorRepository } from '../shared/persistence/indexeddb/cursor-repository.js';
import { ResourceRepository } from '../shared/persistence/indexeddb/resource-repository.js';
import { WorkspaceSwitchController } from '../workspace/workspace-switch-controller.js';
import { applyWave1Change, stripSecretsFromSettings } from '../sync/apply-wave1.js';
import { clearRoster } from '../sync/roster-store.js';
import { newRequestId } from '../shared/api/cloud-client.js';

/**
 * @returns {string}
 */
export function newOperationId() {
  return `op_${newRequestId().replace(/-/g, '')}`;
}

/**
 * @typedef {object} AccountSyncWiringDeps
 * @property {import('../shared/api/cloud-client.ts').CloudClient} client
 * @property {import('../sync/sync-status-store.ts').SyncStatusStore} statusStore
 * @property {import('../sync/conflict-store.ts').ConflictStore} conflictStore
 * @property {import('../sync/resource-registry.ts').ResourceRegistry} registry
 * @property {import('../workspace/workspace-context-store.ts').WorkspaceContextStore} contextStore
 * @property {() => void} [assertWritable]
 */

/**
 * @param {AccountSyncWiringDeps} deps
 */
export async function createAccountSyncWiring(deps) {
  const { client, statusStore, conflictStore, registry, contextStore } = deps;

  /** @type {IDBDatabase | null} */
  let db = null;
  /** @type {LocalResourceService | null} */
  let localResources = null;
  /** @type {OutboxRepository | null} */
  let outbox = null;
  /** @type {CursorRepository | null} */
  let cursors = null;
  /** @type {ResourceRepository | null} */
  let resources = null;
  /** @type {SyncController | null} */
  let syncController = null;
  /** @type {WorkspaceSwitchController | null} */
  let switcher = null;

  async function hydrateWave1FromLocal() {
    if (!resources) {
      clearRoster({ persist: false });
      return;
    }
    const ctx = contextStore.getContext();
    try {
      const settings = await resources.get(ctx.workspaceId, 'teacher.settings', 'default');
      if (settings && settings.deletedAt == null) {
        applyWave1Change({
          resourceType: 'teacher.settings',
          resourceId: 'default',
          payload: settings.payload,
          deletedAt: null,
        });
      }
      const roster = await resources.get(ctx.workspaceId, 'class.roster', 'default');
      if (roster && roster.deletedAt == null) {
        applyWave1Change({
          resourceType: 'class.roster',
          resourceId: 'default',
          payload: roster.payload,
          deletedAt: null,
        });
      } else {
        clearRoster({ persist: false });
      }
    } catch (err) {
      console.error('[account-cloud] hydrate wave1 failed', err);
    }
  }

  async function refreshPendingCount() {
    if (!outbox) return;
    const ctx = contextStore.getContext();
    if (ctx.mode !== 'authenticated') {
      statusStore.update({ pendingCount: 0 });
      return;
    }
    const pending = await outbox.listPending(ctx.workspaceId);
    statusStore.update({ pendingCount: pending.length });
  }

  try {
    db = await openLocalDatabase();
    localResources = new LocalResourceService({
      db,
      generation: contextStore.getGeneration(),
    });
    outbox = new OutboxRepository(db);
    cursors = new CursorRepository(db);
    resources = new ResourceRepository(db);
    conflictStore.attach(db);
    await conflictStore.hydrate();

    syncController = new SyncController({
      client,
      statusStore,
      conflictStore,
      registry,
      contextStore,
      localResources,
      createOperationId: newOperationId,
      getOutboxOperations: async () => {
        const ctx = contextStore.getContext();
        const pending = await outbox.listPending(ctx.workspaceId);
        return pending.map((entry) => ({
          operationId: entry.operationId,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          payload: entry.payload,
          baseRevision: entry.baseRevision,
          deletedAt: entry.deletedAt,
          schemaVersion: entry.schemaVersion,
        }));
      },
      countPendingOutbox: async () => {
        const ctx = contextStore.getContext();
        return outbox.countPending(ctx.workspaceId);
      },
      updateOutboxStatuses: (patches) => outbox.updateStatuses(patches),
      revertInflightOutbox: async () => {
        const ctx = contextStore.getContext();
        await outbox.revertInflightToPending(ctx.workspaceId);
      },
      ackOutboxOperations: async (operationIds) => {
        const now = Date.now();
        for (const id of operationIds) {
          try {
            await outbox.markApplied(id, now);
          } catch {
            /* already applied or missing */
          }
        }
        const ctx = contextStore.getContext();
        const pending = await outbox.listPending(ctx.workspaceId);
        statusStore.update({ pendingCount: pending.length });
      },
      applyPulledChanges: async (changes) => {
        const ctx = contextStore.getContext();
        for (const change of changes) {
          const config = registry.get(change.resourceType);
          let payload = change.payload;
          if (config?.parse) {
            try {
              payload = config.parse(change.payload);
            } catch (err) {
              console.error('[account-cloud] skip invalid pulled resource', change.resourceType, err);
              continue;
            }
          }
          await resources.put({
            workspaceId: ctx.workspaceId,
            resourceType: change.resourceType,
            resourceId: change.resourceId,
            schemaVersion: config?.schemaVersion ?? 1,
            revision: change.revision,
            payload,
            localOnly: false,
            updatedAt: Date.now(),
            deletedAt: change.deletedAt,
          });
          applyWave1Change({
            resourceType: change.resourceType,
            resourceId: change.resourceId,
            payload,
            deletedAt: change.deletedAt,
          });
        }
      },
      saveCursor: async (cursor) => {
        const ctx = contextStore.getContext();
        await cursors.put({
          workspaceId: ctx.workspaceId,
          token: cursor.token,
          sequence: cursor.sequence,
          updatedAt: Date.now(),
        });
      },
      loadCursor: async () => {
        const ctx = contextStore.getContext();
        const record = await cursors.get(ctx.workspaceId);
        return record ? { token: record.token, sequence: record.sequence } : null;
      },
    });

    switcher = new WorkspaceSwitchController(contextStore, {
      abortNetwork: () => syncController?.cancel(),
      clearCache: () => {
        conflictStore.clear();
      },
      onSwitched: (ctx) => {
        localResources?.setGeneration(ctx.generation);
        void hydrateWave1FromLocal();
      },
    });
  } catch (err) {
    console.error('[account-cloud] IndexedDB unavailable; sync disabled', err);
  }

  /**
   * @param {unknown} payload
   * @param {{ isAuthenticated: () => boolean }} session
   */
  async function enqueueTeacherSettings(payload, session) {
    deps.assertWritable?.();
    if (!localResources || !session.isAuthenticated()) return;
    const ctx = contextStore.getContext();
    if (ctx.mode !== 'authenticated' || !ctx.workspaceId.startsWith('ws_')) return;

    const existing = resources
      ? await resources.get(ctx.workspaceId, 'teacher.settings', 'default')
      : null;

    await localResources.write(
      {
        workspaceId: ctx.workspaceId,
        resourceType: 'teacher.settings',
        resourceId: 'default',
        schemaVersion: 1,
        revision: existing?.revision ?? 0,
        payload: stripSecretsFromSettings(payload),
        localOnly: false,
        operationId: newOperationId(),
        baseRevision: existing?.revision ?? null,
      },
      ctx.generation,
    );
    await refreshPendingCount();
  }

  /**
   * @param {Array<{ id: string, name: string }>} students
   * @param {{ isAuthenticated: () => boolean }} session
   */
  async function enqueueClassRoster(students, session) {
    deps.assertWritable?.();
    if (!localResources || !session.isAuthenticated()) return;
    const ctx = contextStore.getContext();
    if (ctx.mode !== 'authenticated' || !ctx.workspaceId.startsWith('ws_')) return;

    const existing = resources
      ? await resources.get(ctx.workspaceId, 'class.roster', 'default')
      : null;

    await localResources.write(
      {
        workspaceId: ctx.workspaceId,
        resourceType: 'class.roster',
        resourceId: 'default',
        schemaVersion: 1,
        revision: existing?.revision ?? 0,
        payload: { students },
        localOnly: false,
        operationId: newOperationId(),
        baseRevision: existing?.revision ?? null,
      },
      ctx.generation,
    );
    await refreshPendingCount();
  }

  return {
    db,
    localResources,
    outbox,
    cursors,
    resources,
    syncController,
    switcher,
    hydrateWave1FromLocal,
    refreshPendingCount,
    enqueueTeacherSettings,
    enqueueClassRoster,
  };
}
