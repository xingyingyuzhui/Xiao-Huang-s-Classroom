/**
 * Lightweight account-cloud orchestration. Controllers live in sibling modules.
 */
import { loadRuntimeConfig, isFeatureEnabled, getRuntimeConfig } from '../shared/runtime-config.js';
import { CloudClient, newRequestId } from '../shared/api/cloud-client.js';
import { AccountSessionController } from './account-session-controller.js';
import { RememberedAccountStore } from './remembered-account-store.js';
import { SyncStatusStore } from '../sync/sync-status-store.js';
import { ConflictStore } from '../sync/conflict-store.js';
import { ResourceRegistry } from '../sync/resource-registry.js';
import { registerWave1Adapters } from '../sync/adapters/index.js';
import { WorkspaceContextStore } from '../workspace/workspace-context-store.js';
import { guestWorkspaceKey } from '../workspace/workspace-key.js';
import { NetworkMonitor } from '../offline/network-monitor.js';
import {
  OfflineCapabilityRegistry,
  registerDefaultCapabilities,
} from '../offline/offline-capability-registry.js';
import { getCurrentSubjectId } from '../subjects/session.js';
import { createSubjectContextController } from './subject-context-controller.js';
import { createAccountSyncWiring } from './account-sync-wiring.js';
import { bindAccountAi } from './account-ai-binding.js';
import {
  createAccountSettingsController,
  getDesktopAccountApi,
  mapDesktopSession,
  createClassController,
  createGuestCopyController,
} from './account-settings-ui.js';

const DEVICE_ID_KEY = 'xh-device-id';

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

function bootstrapSubjectId() {
  try {
    return getCurrentSubjectId();
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<object | null>}
 */
export async function createAccountCloudRuntime() {
  await loadRuntimeConfig();
  if (!isFeatureEnabled('accountCloudProgram')) return null;

  const config = getRuntimeConfig();
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
    initialSubjectId: bootstrapSubjectId() ?? 'chemistry',
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

  /** @type {ReturnType<typeof createSubjectContextController> | null} */
  let subjectContext = null;
  /** @type {boolean} */
  let guestCopyDismissed = false;
  /** @type {boolean} */
  let accountPendingDeletion = false;

  const sync = await createAccountSyncWiring({
    client,
    statusStore,
    conflictStore,
    registry,
    contextStore,
    assertWritable: () => subjectContext?.assertWritable(),
  });

  /** @param {import('@xiaohuang/contracts').WorkspaceContext} next */
  async function switchWorkspace(next) {
    if (!sync.switcher) {
      contextStore.setContext(next);
      sync.localResources?.setGeneration(next.generation);
      return next;
    }
    return sync.switcher.switch(next, next.generation);
  }

  async function switchToGuest() {
    await subjectContext?.deactivateSubject();
    sync.syncController?.cancel();
    client.abortInflight();
    const subjectId = contextStore.getContext().subjectId;
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
    classCtl.clearLists();
  }

  handleUnauthorized = () => {
    session.clearSession();
    void switchToGuest().finally(() => refreshSettingsSection());
  };

  subjectContext = createSubjectContextController({
    contextStore,
    switcher: sync.switcher,
    switchWorkspace,
    session,
    client,
    syncController: sync.syncController,
    statusStore,
    deviceId,
    hydrateWave1FromLocal: sync.hydrateWave1FromLocal,
    refreshPendingCount: sync.refreshPendingCount,
    refreshSettingsSection: () => refreshSettingsSection(),
  });

  const guestCtl = createGuestCopyController({
    client,
    contextStore,
    resources: sync.resources,
    localResources: sync.localResources,
    registry,
    get subjectContext() {
      return subjectContext;
    },
    refreshPendingCount: sync.refreshPendingCount,
    refreshSettingsSection: () => refreshSettingsSection(),
    isDismissed: () => guestCopyDismissed,
    dismiss: () => {
      guestCopyDismissed = true;
    },
  });

  const classCtl = createClassController({
    client,
    contextStore,
    session,
    get subjectContext() {
      return subjectContext;
    },
    refreshSettingsSection: () => refreshSettingsSection(),
    renderGuestCopy: (guestRoot, sess) => guestCtl.renderGuestCopy(guestRoot, sess),
  });

  const settingsCtl = createAccountSettingsController({
    session,
    remembered,
    client,
    statusStore,
    conflictStore,
    contextStore,
    get syncController() {
      return sync.syncController;
    },
    deviceId,
    get subjectContext() {
      return subjectContext;
    },
    switchToGuest,
    refreshClassList: () => classCtl.refreshClassList(),
    refreshPendingCount: sync.refreshPendingCount,
    hydrateWave1FromLocal: sync.hydrateWave1FromLocal,
    refreshSettingsSection: () => refreshSettingsSection(),
    setPendingDeletion: (value) => {
      accountPendingDeletion = value;
    },
    getPendingDeletion: () => accountPendingDeletion,
  });

  function refreshSettingsSection() {
    const section = document.getElementById('settingsAccountSection');
    const accountRoot = document.getElementById('accountPanelRoot');
    const syncRoot = document.getElementById('syncPanelRoot');
    const syncBlock = document.getElementById('settingsSyncBlock');
    const classBlock = document.getElementById('settingsClassBlock');
    const classRoot = document.getElementById('classSwitcherRoot');
    const guestRoot = document.getElementById('guestCopyRoot');
    if (section) section.hidden = false;
    settingsCtl.renderAccountBlock(accountRoot);
    const authed = session.isAuthenticated();
    if (!authed) accountPendingDeletion = false;
    if (syncBlock) syncBlock.hidden = !authed || accountPendingDeletion;
    if (classBlock) classBlock.hidden = !authed || accountPendingDeletion;
    settingsCtl.renderSyncBlock(syncRoot);
    void classCtl.renderClassBlock(classRoot, guestRoot);
  }

  const unbindAi = bindAccountAi({
    session,
    client,
    assertWritable: () => subjectContext?.assertWritable(),
    enqueueClassRoster: (students) => sync.enqueueClassRoster(students, session),
  });

  const unsubSession = session.subscribe(() => {
    void (async () => {
      if (session.isAuthenticated()) {
        await classCtl.refreshClassList();
        await sync.refreshPendingCount();
      }
      refreshSettingsSection();
    })();
  });
  const unsubStatus = statusStore.subscribe(() => {
    settingsCtl.renderSyncBlock(document.getElementById('syncPanelRoot'));
  });

  void restoreSessionIfNeeded();

  async function restoreSessionIfNeeded() {
    if (!session.getAccessToken()) {
      const desktopApi = getDesktopAccountApi();
      if (desktopApi?.restoreSession) {
        try {
          const restored = await desktopApi.restoreSession(undefined, deviceId);
          if (restored?.restored && restored.accessToken) {
            await settingsCtl.afterLoginSuccess(mapDesktopSession(restored, deviceId));
            return;
          }
        } catch (err) {
          console.error('[account-cloud] desktop restore failed', err);
        }
      }
      try {
        const restored = await client.refreshSession();
        if (restored) {
          await settingsCtl.afterLoginSuccess(restored);
          return;
        }
      } catch (err) {
        console.error('[account-cloud] cookie refresh failed', err);
        session.clearSession();
      }
      refreshSettingsSection();
      return;
    }
    if (!session.isAuthenticated()) return;
    try {
      const activeSubject = subjectContext?.getActiveSubjectId();
      if (activeSubject) await subjectContext.activateSubject(activeSubject);
      await classCtl.refreshClassList();
      await sync.refreshPendingCount();
    } catch (err) {
      console.error('[account-cloud] restore workspace failed', err);
      statusStore.update({
        phase: 'failed',
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
    refreshSettingsSection();
  }

  return {
    session,
    remembered,
    client,
    statusStore,
    conflictStore,
    contextStore,
    syncController: sync.syncController,
    offlineCaps,
    enqueueTeacherSettings: (payload) => sync.enqueueTeacherSettings(payload, session),
    refreshSettingsSection,
    activateSubject: (subjectId) => subjectContext.activateSubject(subjectId),
    deactivateSubject: () => subjectContext.deactivateSubject(),
    switchClass: (classId) => subjectContext.switchClass(classId),
    dispose() {
      unsubSession?.();
      unsubStatus?.();
      unsubNetwork();
      network.dispose();
      sync.syncController?.cancel();
      unbindAi();
      sync.db?.close();
    },
  };
}
