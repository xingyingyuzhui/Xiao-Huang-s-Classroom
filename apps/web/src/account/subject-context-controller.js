/**
 * Authoritative subject / class workspace transitions for account cloud mode.
 * Shell must call activateSubject / deactivateSubject — never infer subject from session fallback.
 */
import { AppError } from '@xiaohuang/domain-core';
import { guestWorkspaceKey } from '../workspace/workspace-key.js';
import { clearRoster } from '../sync/roster-store.js';

/**
 * @typedef {object} SubjectContextControllerDeps
 * @property {import('../workspace/workspace-context-store.ts').WorkspaceContextStore} contextStore
 * @property {import('../workspace/workspace-switch-controller.ts').WorkspaceSwitchController | null} switcher
 * @property {(next: import('@xiaohuang/contracts').WorkspaceContext) => Promise<import('@xiaohuang/contracts').WorkspaceContext>} switchWorkspace
 * @property {import('./account-session-controller.js').AccountSessionController} session
 * @property {import('../shared/api/cloud-client.ts').CloudClient} client
 * @property {import('../sync/sync-controller.ts').SyncController | null} syncController
 * @property {import('../sync/sync-status-store.ts').SyncStatusStore} statusStore
 * @property {string} deviceId
 * @property {() => Promise<void>} hydrateWave1FromLocal
 * @property {() => Promise<void>} refreshPendingCount
 * @property {() => void} refreshSettingsSection
 */

/**
 * @param {SubjectContextControllerDeps} deps
 */
export function createSubjectContextController(deps) {
  let transitionSequence = 0;
  /** @type {string | null} */
  let activeSubjectId = null;

  /**
   * @param {number} transitionId
   */
  function assertTransitionCurrent(transitionId) {
    if (transitionId !== transitionSequence) {
      throw new AppError('FORBIDDEN_WORKSPACE', '学科切换已被更新的操作取代');
    }
  }

  /**
   * @param {number} transitionId
   * @param {number} expectedGeneration
   */
  function assertGenerationUnchanged(transitionId, expectedGeneration) {
    assertTransitionCurrent(transitionId);
    if (deps.contextStore.getGeneration() !== expectedGeneration) {
      throw new AppError('FORBIDDEN_WORKSPACE', '工作区上下文已过期');
    }
  }

  /**
   * @returns {{ transitionId: number, expectedGeneration: number, abort: AbortController }}
   */
  function beginTransition() {
    const transitionId = ++transitionSequence;
    const expectedGeneration = deps.contextStore.getGeneration();
    deps.syncController?.cancel();
    deps.client.abortInflight();
    deps.switcher?.abortInflightRequests();
    const abort = new AbortController();
    deps.switcher?.trackAbortController(abort);
    return { transitionId, expectedGeneration, abort };
  }

  function assertWritable() {
    if (activeSubjectId === null) {
      throw new AppError('FORBIDDEN_WORKSPACE', '学科大厅中不可写入课堂资源');
    }
  }

  /**
   * @param {string} subjectId
   * @param {number} transitionId
   * @param {number} expectedGeneration
   * @param {AbortSignal} signal
   */
  async function resolveWorkspaceForSubject(subjectId, transitionId, expectedGeneration, signal) {
    const current = deps.session.getSession();
    if (!current || !deps.session.isAuthenticated()) {
      return {
        mode: 'guest',
        accountId: null,
        classId: null,
        subjectId,
        workspaceId: guestWorkspaceKey(subjectId),
        kind: 'guest',
        deviceId: deps.deviceId,
      };
    }

    const ctx = deps.contextStore.getContext();
    const classId = ctx.kind === 'class' ? ctx.classId : null;

    if (classId) {
      const ws = await deps.client.ensureClassWorkspace(classId, subjectId, signal);
      assertGenerationUnchanged(transitionId, expectedGeneration);
      return {
        mode: 'authenticated',
        accountId: current.accountId,
        classId,
        subjectId: ws.subjectId,
        workspaceId: ws.id,
        kind: 'class',
        deviceId: deps.deviceId,
      };
    }

    const ws = await deps.client.ensurePersonalWorkspace(subjectId, signal);
    assertGenerationUnchanged(transitionId, expectedGeneration);
    return {
      mode: 'authenticated',
      accountId: current.accountId,
      classId: null,
      subjectId: ws.subjectId,
      workspaceId: ws.id,
      kind: 'personal',
      deviceId: deps.deviceId,
    };
  }

  /**
   * @param {string} subjectId
   * @returns {Promise<{ ok: true } | { ok: false, reason: 'stale' | 'aborted' }>}
   */
  async function activateSubject(subjectId) {
    if (!subjectId) {
      throw new AppError('VALIDATION_REQUIRED', '缺少学科标识');
    }

    const { transitionId, expectedGeneration, abort } = beginTransition();

    try {
      const next = await resolveWorkspaceForSubject(
        subjectId,
        transitionId,
        expectedGeneration,
        abort.signal,
      );
      assertGenerationUnchanged(transitionId, expectedGeneration);
      await deps.switchWorkspace({
        ...next,
        generation: expectedGeneration,
      });
      assertTransitionCurrent(transitionId);

      activeSubjectId = subjectId;
      await deps.hydrateWave1FromLocal();
      await deps.refreshPendingCount();
      deps.refreshSettingsSection();
      return { ok: true };
    } catch (err) {
      if (err instanceof AppError && err.code === 'FORBIDDEN_WORKSPACE') {
        return { ok: false, reason: 'stale' };
      }
      if (abort.signal.aborted) {
        return { ok: false, reason: 'aborted' };
      }
      deps.statusStore.update({
        phase: 'failed',
        lastError: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async function deactivateSubject() {
    transitionSequence += 1;
    deps.syncController?.cancel();
    deps.client.abortInflight();
    deps.switcher?.abortInflightRequests();
    activeSubjectId = null;
    clearRoster({ persist: false });
  }

  /**
   * @param {string | null} classId
   */
  async function switchClass(classId) {
    assertWritable();
    const subjectId = activeSubjectId;
    if (!subjectId) {
      throw new AppError('FORBIDDEN_WORKSPACE', '未进入学科，无法切换班级');
    }

    const current = deps.session.getSession();
    if (!current || !deps.session.isAuthenticated()) {
      return;
    }

    const ctx = deps.contextStore.getContext();
    if (classId == null && ctx.mode === 'authenticated' && ctx.kind === 'personal') {
      await deps.refreshPendingCount();
      deps.refreshSettingsSection();
      return;
    }
    if (classId != null && ctx.classId === classId && ctx.kind === 'class') {
      await deps.refreshPendingCount();
      deps.refreshSettingsSection();
      return;
    }

    const { transitionId, expectedGeneration, abort } = beginTransition();

    try {
      /** @type {import('@xiaohuang/contracts').WorkspaceContext} */
      let next;
      if (classId == null) {
        const ws = await deps.client.ensurePersonalWorkspace(subjectId, abort.signal);
        assertGenerationUnchanged(transitionId, expectedGeneration);
        next = {
          mode: 'authenticated',
          accountId: current.accountId,
          classId: null,
          subjectId: ws.subjectId,
          workspaceId: ws.id,
          kind: 'personal',
          deviceId: deps.deviceId,
        };
      } else {
        const ws = await deps.client.ensureClassWorkspace(classId, subjectId, abort.signal);
        assertGenerationUnchanged(transitionId, expectedGeneration);
        next = {
          mode: 'authenticated',
          accountId: current.accountId,
          classId,
          subjectId: ws.subjectId,
          workspaceId: ws.id,
          kind: 'class',
          deviceId: deps.deviceId,
        };
      }

      assertGenerationUnchanged(transitionId, expectedGeneration);
      await deps.switchWorkspace({
        ...next,
        generation: expectedGeneration,
      });
      assertTransitionCurrent(transitionId);
      await deps.hydrateWave1FromLocal();
      await deps.refreshPendingCount();
      deps.refreshSettingsSection();
    } catch (err) {
      if (err instanceof AppError && err.code === 'FORBIDDEN_WORKSPACE') {
        return;
      }
      if (abort.signal.aborted) {
        return;
      }
      throw err;
    }
  }

  return {
    activateSubject,
    deactivateSubject,
    switchClass,
    getActiveSubjectId: () => activeSubjectId,
    assertWritable,
    getTransitionSequence: () => transitionSequence,
  };
}
