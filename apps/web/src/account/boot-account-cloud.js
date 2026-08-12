/**
 * Feature-flagged account / sync boot for the web shell.
 * Constructs controllers only when accountCloudProgram is enabled.
 */
import { loadRuntimeConfig, isFeatureEnabled } from '../shared/runtime-config.js';
import { CloudClient, newRequestId } from '../shared/api/cloud-client.js';
import { AccountSessionController } from './account-session-controller.js';
import { RememberedAccountStore } from './remembered-account-store.js';
import { SyncStatusStore } from '../sync/sync-status-store.js';
import { ConflictStore } from '../sync/conflict-store.js';
import { ResourceRegistry } from '../sync/resource-registry.js';
import { SyncController } from '../sync/sync-controller.js';
import { registerWave1Adapters } from '../sync/adapters/index.js';
import { LocalResourceService } from '../sync/local-resource-service.js';
import { openLocalDatabase } from '../shared/persistence/indexeddb/database.js';
import { OutboxRepository } from '../shared/persistence/indexeddb/outbox-repository.js';
import { CursorRepository } from '../shared/persistence/indexeddb/cursor-repository.js';
import { ResourceRepository } from '../shared/persistence/indexeddb/resource-repository.js';
import { WorkspaceContextStore } from '../workspace/workspace-context-store.js';
import { WorkspaceSwitchController } from '../workspace/workspace-switch-controller.js';
import { renderClassSwitcher } from '../workspace/class-switcher.js';
import { renderGuestCopyPrompt } from '../workspace/guest-copy-flow.js';
import { guestWorkspaceKey } from '../workspace/workspace-key.js';
import { NetworkMonitor } from '../offline/network-monitor.js';
import {
  OfflineCapabilityRegistry,
  registerDefaultCapabilities,
} from '../offline/offline-capability-registry.js';
import { renderSyncPanel } from '../sync/sync-panel.js';
import { showLoginDialog } from './login-dialog.js';
import { showConflictDialog } from '../sync/conflict-dialog.js';
import { applyWave1Change, stripSecretsFromSettings } from '../sync/apply-wave1.js';
import { clearRoster, setRosterPersistHandler } from '../sync/roster-store.js';
import { createButton, createInput } from '@xiaohuang/ui';
import { appConfirm } from '../shared/ui/app-dialog.js';
import { getCurrentSubjectId } from '../subjects/session.js';

const DEVICE_ID_KEY = 'xh-device-id';

/**
 * @typedef {object} AccountCloudBundle
 * @property {AccountSessionController} session
 * @property {RememberedAccountStore} remembered
 * @property {CloudClient} client
 * @property {SyncStatusStore} statusStore
 * @property {ConflictStore} conflictStore
 * @property {WorkspaceContextStore} contextStore
 * @property {SyncController | null} syncController
 * @property {(payload: unknown) => Promise<void>} enqueueTeacherSettings
 * @property {() => void} refreshSettingsSection
 * @property {() => void} dispose
 */

function getOrCreateDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(existing)) {
      return existing;
    }
  } catch {
    /* ignore */
  }
  const id = `dev_${newRequestId().replace(/-/g, '').slice(0, 24)}`;
  try {
    localStorage.setItem(DEVICE_ID_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

function currentSubjectId() {
  try {
    return getCurrentSubjectId() || 'chemistry';
  } catch {
    return 'chemistry';
  }
}

function newOperationId() {
  return `op_${newRequestId().replace(/-/g, '')}`;
}

/**
 * @typedef {{
 *   login: Function,
 *   restoreSession?: Function,
 *   logout?: Function,
 *   removeCard?: Function,
 *   capabilities?: Function,
 * }} DesktopAccountApi
 */

/** @returns {DesktopAccountApi | null} */
function getDesktopAccountApi() {
  const api = /** @type {DesktopAccountApi | undefined} */ (globalThis.xiaohuangAccount);
  if (!api || typeof api.login !== 'function') return null;
  return api;
}

/**
 * @param {Record<string, unknown>} ipcResult
 * @param {string} fallbackDeviceId
 */
function mapDesktopSession(ipcResult, fallbackDeviceId) {
  const expiresAt =
    typeof ipcResult.expiresAt === 'number'
      ? ipcResult.expiresAt
      : Date.parse(String(ipcResult.expiresAt ?? ''));
  return {
    accountId: String(ipcResult.accountId || ''),
    displayName: String(ipcResult.displayName || ipcResult.accountId || ''),
    accessToken: String(ipcResult.accessToken || ''),
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 15 * 60_000,
    sessionId: String(ipcResult.sessionId || 'sess_desktop'),
    deviceId: String(ipcResult.deviceId || fallbackDeviceId),
    avatarUrl: typeof ipcResult.avatarUrl === 'string' ? ipcResult.avatarUrl : null,
  };
}

/**
 * @returns {Promise<AccountCloudBundle | null>}
 */
export async function bootAccountCloud() {
  await loadRuntimeConfig();
  if (!isFeatureEnabled('accountCloudProgram')) return null;

  const config = (await import('../shared/runtime-config.js')).getRuntimeConfig();
  const baseUrl = String(config.cloudBaseUrl || '').replace(/\/+$/, '');
  if (!baseUrl) return null;

  const deviceId = getOrCreateDeviceId();
  const session = new AccountSessionController(
    typeof sessionStorage === 'undefined' ? null : sessionStorage,
  );
  const remembered = new RememberedAccountStore(localStorage);
  const statusStore = new SyncStatusStore();
  const conflictStore = new ConflictStore();
  const contextStore = new WorkspaceContextStore({
    deviceId,
    initialSubjectId: currentSubjectId(),
  });
  const registry = new ResourceRegistry();
  registerWave1Adapters(registry);

  const network = new NetworkMonitor();
  const offlineCaps = new OfflineCapabilityRegistry();
  registerDefaultCapabilities(offlineCaps);
  statusStore.update({ online: network.isOnline() });
  const unsubNetwork = network.subscribe((online) => statusStore.update({ online }));

  /** @type {() => void} */
  let handleUnauthorized = () => {
    session.clearSession();
  };

  const client = new CloudClient({
    baseUrl,
    getAccessToken: () => session.getAccessToken(),
    getDeviceId: () => deviceId,
    onRefreshed: (result) => {
      session.setSession({
        accountId: result.accountId,
        displayName: result.displayName,
        accessToken: result.accessToken,
        expiresAt: result.expiresAt,
        avatarUrl: result.avatarUrl ?? null,
      });
    },
    onUnauthorized: () => {
      handleUnauthorized();
    },
  });

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
  /** @type {Array<import('@xiaohuang/contracts').ClassRecord>} */
  let classList = [];
  /** @type {Array<import('@xiaohuang/contracts').ClassRecord>} */
  let trashList = [];
  /** @type {boolean} */
  let guestCopyDismissed = false;

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

  /** @type {(() => void) | null} */
  let unsubSession = null;
  /** @type {(() => void) | null} */
  let unsubStatus = null;

  /**
   * @param {import('@xiaohuang/contracts').WorkspaceContext} next
   */
  async function switchWorkspace(next) {
    if (!switcher) {
      contextStore.setContext(next);
      localResources?.setGeneration(next.generation);
      return next;
    }
    return switcher.switch(next, contextStore.getGeneration());
  }

  async function switchToGuest() {
    syncController?.cancel();
    client.abortInflight();
    const subjectId = currentSubjectId();
    await switchWorkspace({
      mode: 'guest',
      accountId: null,
      classId: null,
      subjectId,
      workspaceId: guestWorkspaceKey(subjectId),
      kind: 'guest',
      deviceId,
      generation: contextStore.getGeneration(),
    });
    classList = [];
    trashList = [];
  }

  handleUnauthorized = () => {
    session.clearSession();
    void switchToGuest().finally(() => {
      refreshSettingsSection();
    });
  };

  async function ensureAuthenticatedPersonalWorkspace() {
    const subjectId = currentSubjectId();
    const current = session.getSession();
    if (!current || !session.isAuthenticated()) {
      throw new Error('未登录');
    }
    const ws = await client.ensurePersonalWorkspace(subjectId);
    await switchWorkspace({
      mode: 'authenticated',
      accountId: current.accountId,
      classId: null,
      subjectId: ws.subjectId,
      workspaceId: ws.id,
      kind: 'personal',
      deviceId,
      generation: contextStore.getGeneration(),
    });
    return ws;
  }

  /**
   * @param {string | null} classId
   */
  async function switchToClass(classId) {
    const subjectId = currentSubjectId();
    const current = session.getSession();
    if (!current || !session.isAuthenticated()) return;

    const ctx = contextStore.getContext();
    if (classId == null && ctx.mode === 'authenticated' && ctx.kind === 'personal') {
      await refreshPendingCount();
      refreshSettingsSection();
      return;
    }
    if (classId != null && ctx.classId === classId && ctx.kind === 'class') {
      await refreshPendingCount();
      refreshSettingsSection();
      return;
    }

    if (classId == null) {
      await ensureAuthenticatedPersonalWorkspace();
    } else {
      const ws = await client.ensureClassWorkspace(classId, subjectId);
      await switchWorkspace({
        mode: 'authenticated',
        accountId: current.accountId,
        classId,
        subjectId: ws.subjectId,
        workspaceId: ws.id,
        kind: 'class',
        deviceId,
        generation: contextStore.getGeneration(),
      });
    }
    await refreshPendingCount();
    await hydrateWave1FromLocal();
    refreshSettingsSection();
  }

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

  async function refreshClassList() {
    if (!session.isAuthenticated()) {
      classList = [];
      trashList = [];
      return;
    }
    try {
      classList = await client.listClasses();
    } catch (err) {
      console.error('[account-cloud] listClasses failed', err);
      classList = [];
    }
    try {
      trashList = await client.listTrashClasses();
    } catch (err) {
      console.error('[account-cloud] listTrash failed', err);
      trashList = [];
    }
  }

  /**
   * @param {unknown} payload
   */
  async function enqueueTeacherSettings(payload) {
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
   */
  async function enqueueClassRoster(students) {
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

  /**
   * @param {string} targetClassName
   */
  async function copyGuestDataToClass(targetClassName) {
    if (!resources || !localResources) return;
    const subjectId = currentSubjectId();
    const guestKey = guestWorkspaceKey(subjectId);
    const guestRecords = await resources.listByWorkspace(guestKey);

    const created = await client.createClass(targetClassName);
    await switchToClass(created.id);

    const ctx = contextStore.getContext();
    for (const record of guestRecords) {
      if (record.deletedAt != null) continue;
      if (!registry.has(record.resourceType)) continue;
      await localResources.write(
        {
          workspaceId: ctx.workspaceId,
          resourceType: record.resourceType,
          resourceId: record.resourceId,
          schemaVersion: record.schemaVersion,
          revision: 0,
          payload: record.payload,
          localOnly: false,
          operationId: newOperationId(),
          baseRevision: null,
        },
        ctx.generation,
      );
    }
    guestCopyDismissed = true;
    await refreshPendingCount();
    refreshSettingsSection();
  }

  async function afterLoginSuccess(result) {
    session.setSession({
      accountId: result.accountId,
      displayName: result.displayName,
      accessToken: result.accessToken,
      expiresAt: result.expiresAt,
      avatarUrl: result.avatarUrl ?? null,
    });
    remembered.remember({
      accountId: result.accountId,
      displayName: result.displayName,
      avatarUrl: result.avatarUrl ?? null,
      lastUsedAt: Date.now(),
    });
    if (result.deviceId) {
      try {
        localStorage.setItem(DEVICE_ID_KEY, result.deviceId);
      } catch {
        /* ignore */
      }
    }
    try {
      await ensureAuthenticatedPersonalWorkspace();
      await refreshClassList();
      await refreshPendingCount();
    } catch (err) {
      console.error('[account-cloud] workspace ensure failed', err);
      statusStore.update({
        phase: 'failed',
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
    refreshSettingsSection();
  }

  function renderAccountBlock(root) {
    if (!root) return;
    root.textContent = '';

    const wrap = document.createElement('div');
    wrap.className = 'account-settings-panel';

    const current = session.getSession();
    if (current && session.isAuthenticated()) {
      const summary = document.createElement('div');
      summary.className = 'account-settings-summary';
      summary.textContent = `已登录：${current.displayName}`;
      wrap.appendChild(summary);

      const wsHint = document.createElement('p');
      wsHint.className = 'settings-hint';
      const ctx = contextStore.getContext();
      wsHint.textContent =
        ctx.kind === 'class'
          ? `当前工作区：班级（${ctx.classId}）`
          : '当前工作区：个人空间';
      wrap.appendChild(wsHint);

      const logoutBtn = createButton({
        label: '退出登录',
        kind: 'secondary',
        onClick: () => {
          void (async () => {
            const desktopApi = getDesktopAccountApi();
            try {
              if (desktopApi?.logout && current) {
                await desktopApi.logout(current.accountId, deviceId);
              } else {
                await client.logout();
              }
            } catch {
              /* local clear still proceeds */
            }
            session.clearSession();
            await switchToGuest();
            refreshSettingsSection();
          })();
        },
      });
      wrap.appendChild(logoutBtn.element);

      const pwRow = document.createElement('div');
      pwRow.className = 'account-password-row';
      const currentPw = createInput({ placeholder: '当前密码', 'aria-label': '当前密码' });
      const nextPw = createInput({ placeholder: '新密码（至少 8 位）', 'aria-label': '新密码' });
      /** @type {HTMLInputElement} */ (currentPw.element).type = 'password';
      /** @type {HTMLInputElement} */ (nextPw.element).type = 'password';
      const pwBtn = createButton({
        label: '修改密码',
        kind: 'secondary',
        onClick: async () => {
          const currentPassword = /** @type {HTMLInputElement} */ (currentPw.element).value;
          const newPassword = /** @type {HTMLInputElement} */ (nextPw.element).value;
          if (!currentPassword || newPassword.length < 8) return;
          pwBtn.update({ disabled: true, loading: true });
          try {
            await client.changePassword(currentPassword, newPassword);
            /** @type {HTMLInputElement} */ (currentPw.element).value = '';
            /** @type {HTMLInputElement} */ (nextPw.element).value = '';
          } catch (err) {
            console.error('[account-cloud] changePassword failed', err);
          } finally {
            pwBtn.update({ disabled: false, loading: false });
          }
        },
      });
      pwRow.append(currentPw.element, nextPw.element, pwBtn.element);
      wrap.appendChild(pwRow);

      const deviceHost = document.createElement('div');
      deviceHost.className = 'account-device-list';
      deviceHost.textContent = '正在加载设备…';
      wrap.appendChild(deviceHost);
      void (async () => {
        try {
          const devices = await client.listDevices();
          deviceHost.textContent = '';
          if (!devices.length) {
            deviceHost.textContent = '没有活动设备';
            return;
          }
          for (const device of devices) {
            const row = document.createElement('div');
            row.className = 'account-device-row';
            const label = document.createElement('span');
            label.textContent = `${device.label}${device.current ? '（本机）' : ''}`;
            row.appendChild(label);
            if (!device.current) {
              const revokeBtn = createButton({
                label: '远程撤销',
                kind: 'danger',
                size: 'sm',
                onClick: async () => {
                  const ok = await appConfirm('撤销后该设备需重新登录。', { danger: true });
                  if (!ok) return;
                  await client.revokeDevice(device.sessionId);
                  refreshSettingsSection();
                },
              });
              row.appendChild(revokeBtn.element);
            }
            deviceHost.appendChild(row);
          }
        } catch (err) {
          console.error('[account-cloud] listDevices failed', err);
          deviceHost.textContent = '无法加载设备列表';
        }
      })();
    } else {
      const hint = document.createElement('p');
      hint.className = 'settings-hint';
      hint.textContent = '登录后可使用云同步（访客模式仍可离线使用教室）。';
      wrap.appendChild(hint);

      const cards = remembered.list();
      if (cards.length) {
        const cardList = document.createElement('div');
        cardList.className = 'account-remembered-list';
        for (const card of cards) {
          const row = document.createElement('div');
          row.className = 'account-remembered-card';
          const label = document.createElement('span');
          label.textContent = card.displayName;
          row.appendChild(label);
          const forgetBtn = createButton({
            label: '移除本机卡片',
            kind: 'ghost',
            size: 'sm',
            onClick: () => {
              void (async () => {
                const desktopApi = getDesktopAccountApi();
                try {
                  if (desktopApi?.removeCard) {
                    await desktopApi.removeCard(card.accountId);
                  }
                } catch (err) {
                  console.error('[account-cloud] removeCard failed', err);
                }
                remembered.forget(card.accountId);
                refreshSettingsSection();
              })();
            },
          });
          row.appendChild(forgetBtn.element);
          cardList.appendChild(row);
        }
        wrap.appendChild(cardList);
      }

      const loginBtn = createButton({
        label: '登录',
        kind: 'primary',
        onClick: async () => {
          const desktopApi = getDesktopAccountApi();
          /** @type {{ login: (u: string, p: string) => Promise<any> }} */
          const loginTarget = desktopApi
            ? {
                login: async (username, password) => {
                  let rememberMe = false;
                  try {
                    const caps = await desktopApi.capabilities?.();
                    rememberMe = Boolean(caps?.rememberMeAvailable);
                  } catch {
                    rememberMe = false;
                  }
                  const ipcResult = await desktopApi.login({
                    username,
                    password,
                    deviceId,
                    deviceLabel: 'Desktop',
                    rememberMe,
                  });
                  return mapDesktopSession(ipcResult, deviceId);
                },
              }
            : client;

          const result = await showLoginDialog(/** @type {any} */ (loginTarget));
          if (!result) return;
          await afterLoginSuccess(result);
        },
      });
      wrap.appendChild(loginBtn.element);
    }

    root.appendChild(wrap);
  }

  function renderSyncBlock(root) {
    if (!root) return;
    if (!session.isAuthenticated()) {
      root.textContent = '';
      return;
    }
    renderSyncPanel(root, {
      status: statusStore.getStatus(),
      onSync: () => {
        if (!syncController) {
          statusStore.update({
            phase: 'failed',
            lastError: '本地同步库不可用',
          });
          return;
        }
        if (syncController.isRunning()) return;
        const ctx = contextStore.getContext();
        if (ctx.mode !== 'authenticated' || !ctx.workspaceId.startsWith('ws_')) {
          statusStore.update({
            phase: 'failed',
            lastError: '工作区未就绪，请重新登录',
          });
          return;
        }
        void syncController.startSync().then(async () => {
          await refreshPendingCount();
          await hydrateWave1FromLocal();
          refreshSettingsSection();
        });
      },
      onViewConflicts: () => {
        const conflicts = conflictStore.listUnresolved();
        if (!conflicts.length) return;
        showConflictDialog({
          conflicts,
          onResolve: (conflictId, resolution) => {
            void (async () => {
              if (syncController) {
                await syncController.resolveConflict(conflictId, resolution);
              } else {
                conflictStore.resolve(conflictId, resolution);
              }
              statusStore.update({ conflictCount: conflictStore.listUnresolved().length });
              refreshSettingsSection();
            })();
          },
          onClose: () => {},
        });
      },
    });
  }

  async function renderClassBlock(root, guestRoot) {
    if (!root) return;
    if (!session.isAuthenticated()) {
      root.textContent = '';
      if (guestRoot) guestRoot.textContent = '';
      return;
    }

    renderClassSwitcher(root, {
      classes: classList,
      trash: trashList,
      activeClassId: contextStore.getContext().classId,
      onSwitch: (classId) => {
        void switchToClass(classId);
      },
      onCreate: async (name) => {
        await client.createClass(name);
        await refreshClassList();
        refreshSettingsSection();
      },
      onCopy: async (classId, name) => {
        await client.copyClass(classId, name);
        await refreshClassList();
        refreshSettingsSection();
      },
      onDelete: async (classId) => {
        await client.deleteClass(classId);
        if (contextStore.getContext().classId === classId) {
          await switchToClass(null);
        }
        await refreshClassList();
        refreshSettingsSection();
      },
      onRestore: async (classId) => {
        await client.restoreClass(classId);
        await refreshClassList();
        refreshSettingsSection();
      },
    });

    if (!guestRoot || !resources || guestCopyDismissed) {
      if (guestRoot) guestRoot.textContent = '';
      return;
    }

    const guestKey = guestWorkspaceKey(currentSubjectId());
    let guestCount = 0;
    try {
      guestCount = (await resources.listByWorkspace(guestKey)).filter((r) => r.deletedAt == null)
        .length;
    } catch {
      guestCount = 0;
    }

    if (guestCount <= 0) {
      guestRoot.textContent = '';
      return;
    }

    renderGuestCopyPrompt(guestRoot, {
      onStartCopy: async (targetClassName) => {
        await copyGuestDataToClass(targetClassName);
      },
    });
  }

  function refreshSettingsSection() {
    const section = document.getElementById('settingsAccountSection');
    const accountRoot = document.getElementById('accountPanelRoot');
    const syncRoot = document.getElementById('syncPanelRoot');
    const syncBlock = document.getElementById('settingsSyncBlock');
    const classBlock = document.getElementById('settingsClassBlock');
    const classRoot = document.getElementById('classSwitcherRoot');
    const guestRoot = document.getElementById('guestCopyRoot');
    if (section) section.hidden = false;
    renderAccountBlock(accountRoot);
    const authed = session.isAuthenticated();
    if (syncBlock) syncBlock.hidden = !authed;
    if (classBlock) classBlock.hidden = !authed;
    renderSyncBlock(syncRoot);
    void renderClassBlock(classRoot, guestRoot);
  }

  setRosterPersistHandler((students) => enqueueClassRoster(students));

  unsubSession = session.subscribe(() => {
    void (async () => {
      if (session.isAuthenticated()) {
        await refreshClassList();
        await refreshPendingCount();
      }
      refreshSettingsSection();
    })();
  });
  unsubStatus = statusStore.subscribe(() => {
    const syncRoot = document.getElementById('syncPanelRoot');
    renderSyncBlock(syncRoot);
  });

  if (!session.getAccessToken()) {
    void (async () => {
      const desktopApi = getDesktopAccountApi();
      if (desktopApi?.restoreSession) {
        try {
          const restored = await desktopApi.restoreSession(undefined, deviceId);
          if (restored?.restored && restored.accessToken) {
            await afterLoginSuccess(mapDesktopSession(restored, deviceId));
            return;
          }
        } catch (err) {
          console.error('[account-cloud] desktop restore failed', err);
        }
      }
      try {
        const restored = await client.refreshSession();
        if (restored) {
          await afterLoginSuccess(restored);
          return;
        }
      } catch (err) {
        console.error('[account-cloud] cookie refresh failed', err);
        session.clearSession();
      }
      refreshSettingsSection();
    })();
  } else if (session.isAuthenticated()) {
    void (async () => {
      try {
        await ensureAuthenticatedPersonalWorkspace();
        await refreshClassList();
        await refreshPendingCount();
      } catch (err) {
        console.error('[account-cloud] restore workspace failed', err);
        statusStore.update({
          phase: 'failed',
          lastError: err instanceof Error ? err.message : String(err),
        });
      }
      refreshSettingsSection();
    })();
  }

  return {
    session,
    remembered,
    client,
    statusStore,
    conflictStore,
    contextStore,
    syncController,
    offlineCaps,
    enqueueTeacherSettings,
    refreshSettingsSection,
    dispose() {
      unsubSession?.();
      unsubStatus?.();
      unsubNetwork();
      network.dispose();
      syncController?.cancel();
      setRosterPersistHandler(null);
      db?.close();
    },
  };
}
