/**
 * Guest-workspace copy into a newly created class.
 */
import { guestWorkspaceKey } from '../workspace/workspace-key.js';
import { renderGuestCopyPrompt } from '../workspace/guest-copy-flow.js';
import { newOperationId } from './account-sync-wiring.js';

/**
 * @typedef {object} GuestCopyControllerDeps
 * @property {import('../shared/api/cloud-client.ts').CloudClient} client
 * @property {import('../workspace/workspace-context-store.ts').WorkspaceContextStore} contextStore
 * @property {import('../shared/persistence/indexeddb/resource-repository.ts').ResourceRepository | null} resources
 * @property {import('../sync/local-resource-service.ts').LocalResourceService | null} localResources
 * @property {import('../sync/resource-registry.ts').ResourceRegistry} registry
 * @property {{ getActiveSubjectId: () => string | null, switchClass: (classId: string | null) => Promise<void> } | null} subjectContext
 * @property {() => Promise<void>} refreshPendingCount
 * @property {() => void} refreshSettingsSection
 * @property {() => boolean} isDismissed
 * @property {() => void} dismiss
 */

/**
 * @param {GuestCopyControllerDeps} deps
 */
export function createGuestCopyController(deps) {
  /**
   * @param {string} targetClassName
   */
  async function copyGuestDataToClass(targetClassName) {
    if (!deps.resources || !deps.localResources) return;
    const subjectId = deps.subjectContext?.getActiveSubjectId();
    if (!subjectId) return;
    const guestKey = guestWorkspaceKey(subjectId);
    const guestRecords = await deps.resources.listByWorkspace(guestKey);

    const created = await deps.client.createClass(targetClassName);
    await deps.subjectContext?.switchClass(created.id);

    const ctx = deps.contextStore.getContext();
    for (const record of guestRecords) {
      if (record.deletedAt != null) continue;
      if (!deps.registry.has(record.resourceType)) continue;
      await deps.localResources.write(
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
    deps.dismiss();
    await deps.refreshPendingCount();
    deps.refreshSettingsSection();
  }

  /**
   * @param {HTMLElement | null} guestRoot
   * @param {{ isAuthenticated: () => boolean }} session
   */
  async function renderGuestCopy(guestRoot, session) {
    if (!guestRoot) return;
    if (!session.isAuthenticated() || !deps.resources || deps.isDismissed()) {
      guestRoot.textContent = '';
      return;
    }

    const activeSubject = deps.subjectContext?.getActiveSubjectId();
    if (!activeSubject) {
      guestRoot.textContent = '';
      return;
    }

    const guestKey = guestWorkspaceKey(activeSubject);
    let guestCount = 0;
    try {
      guestCount = (await deps.resources.listByWorkspace(guestKey)).filter(
        (r) => r.deletedAt == null,
      ).length;
    } catch {
      /* keep 0 */
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

  return {
    copyGuestDataToClass,
    renderGuestCopy,
  };
}
