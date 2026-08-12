/**
 * Class list / switcher / trash UI for account cloud settings.
 */
import { renderClassSwitcher } from '../workspace/class-switcher.js';

/**
 * @typedef {object} ClassControllerDeps
 * @property {import('../shared/api/cloud-client.ts').CloudClient} client
 * @property {import('../workspace/workspace-context-store.ts').WorkspaceContextStore} contextStore
 * @property {import('./account-session-controller.js').AccountSessionController} session
 * @property {{ switchClass: (classId: string | null) => Promise<void> } | null} subjectContext
 * @property {() => void} refreshSettingsSection
 * @property {(guestRoot: HTMLElement | null, session: import('./account-session-controller.js').AccountSessionController) => Promise<void>} renderGuestCopy
 */

/**
 * @param {ClassControllerDeps} deps
 */
export function createClassController(deps) {
  /** @type {Array<import('@xiaohuang/contracts').ClassRecord>} */
  let classList = [];
  /** @type {Array<import('@xiaohuang/contracts').ClassRecord>} */
  let trashList = [];

  async function refreshClassList() {
    if (!deps.session.isAuthenticated()) {
      classList = [];
      trashList = [];
      return;
    }
    try {
      classList = await deps.client.listClasses();
    } catch (err) {
      console.error('[account-cloud] listClasses failed', err);
      classList = [];
    }
    try {
      trashList = await deps.client.listTrashClasses();
    } catch (err) {
      console.error('[account-cloud] listTrash failed', err);
      trashList = [];
    }
  }

  function clearLists() {
    classList = [];
    trashList = [];
  }

  /**
   * @param {HTMLElement | null} root
   * @param {HTMLElement | null} guestRoot
   */
  async function renderClassBlock(root, guestRoot) {
    if (!root) return;
    if (!deps.session.isAuthenticated()) {
      root.textContent = '';
      if (guestRoot) guestRoot.textContent = '';
      return;
    }

    renderClassSwitcher(root, {
      classes: classList,
      trash: trashList,
      activeClassId: deps.contextStore.getContext().classId,
      onSwitch: (classId) => {
        void deps.subjectContext?.switchClass(classId);
      },
      onCreate: async (name) => {
        await deps.client.createClass(name);
        await refreshClassList();
        deps.refreshSettingsSection();
      },
      onCopy: async (classId, name) => {
        await deps.client.copyClass(classId, name);
        await refreshClassList();
        deps.refreshSettingsSection();
      },
      onDelete: async (classId) => {
        await deps.client.deleteClass(classId);
        if (deps.contextStore.getContext().classId === classId) {
          await deps.subjectContext?.switchClass(null);
        }
        await refreshClassList();
        deps.refreshSettingsSection();
      },
      onRestore: async (classId) => {
        await deps.client.restoreClass(classId);
        await refreshClassList();
        deps.refreshSettingsSection();
      },
    });

    await deps.renderGuestCopy(guestRoot, deps.session);
  }

  return {
    refreshClassList,
    clearLists,
    renderClassBlock,
    getClassList: () => classList,
    getTrashList: () => trashList,
  };
}
