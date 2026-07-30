/**
 * 学科进出场控制器：消费 transition-machine 事件，独占壳层切换语义。
 * stage / enter-fx 只负责画，不直接 hide/show lab。
 */

import { createTransitionMachine } from './transition-machine.js';

/**
 * @typedef {object} TransitionAdapters
 * @property {(e: { id: number, subjectId: string|null }) => void} [beginEnterFocus]
 * @property {(e: { id: number, subjectId: string|null }) => void} [beginEnterBook]
 * @property {(e: {
 *   id: number,
 *   subjectId: string|null,
 *   onOpaque: () => void,
 *   onProgress: (t: number) => void,
 *   onCleared: () => void,
 *   onSettled: () => void,
 * }) => void} playEnterCover
 * @property {(e: {
 *   id: number,
 *   subjectId: string|null,
 *   onOpaque: () => void,
 *   onProgress: (t: number) => void,
 *   onCleared: () => void,
 *   onSettled: () => void,
 * }) => void} playExitCover
 * @property {(e: { id: number, subjectId: string|null, onOpaque: () => void }) => void} [playNeutralCover]
 * @property {(id: number) => void} [cancelCover]
 * @property {(subjectId: string, transitionId: number) => Promise<void>} prepareLab
 * @property {(subjectId: string|null, transitionId: number) => Promise<void>} prepareHub
 * @property {(subjectId: string|null) => void} showLab
 * @property {() => void} [enableLab]
 * @property {(subjectId: string|null) => void} showHub
 * @property {() => void} [enableHub]
 * @property {(subjectId: string|null, reason: string) => void} [onFailed]
 * @property {(themeId: string) => void} [commitTheme]
 * @property {(e: { id: number, subjectId: string|null }) => void} [beginReturnBook]
 * @property {(e: { id: number }) => void} [onSettled]
 */

/**
 * @param {TransitionAdapters} adapters
 * @param {object} [opts]
 * @param {Parameters<typeof createTransitionMachine>[0]} [opts.machine]
 */
export function createTransitionController(adapters, opts = {}) {
  /** @type {number} */
  let activeId = 0;
  /** @type {Promise<void> | null} */
  let labPrep = null;
  /** @type {Promise<void> | null} */
  let hubPrep = null;

  const machine = createTransitionMachine({
    ...(opts.machine || {}),
    emit: (e) => {
      opts.machine?.emit?.(e);
      handle(e);
    },
  });

  /**
   * @param {{ type: string, id: number, subjectId?: string|null, [k: string]: any }} e
   */
  function handle(e) {
    activeId = e.id;
    switch (e.type) {
      case 'enter-focus':
        adapters.beginEnterFocus?.({ id: e.id, subjectId: e.subjectId ?? null });
        break;
      case 'enter-book':
        adapters.beginEnterBook?.({ id: e.id, subjectId: e.subjectId ?? null });
        break;
      case 'enter-page': {
        const id = e.id;
        const sid = e.subjectId ?? 'chemistry';
        adapters.playEnterCover({
          id,
          subjectId: sid,
          onOpaque: () => machine.reportPageOpaque(id),
          onProgress: () => {},
          onCleared: () => {},
          onSettled: () => {},
        });
        labPrep = Promise.resolve()
          .then(() => adapters.prepareLab(sid, id))
          .then(() => {
            if (machine.id() === id) machine.reportLabReady(id);
          })
          .catch((err) => {
            console.error('prepareLab failed', err);
            if (machine.id() === id) machine.reportFailed(id, 'lab-error');
          });
        break;
      }
      case 'lab-visible':
        adapters.showLab(e.subjectId ?? null);
        break;
      case 'lab-interactive':
        adapters.enableLab?.();
        break;
      case 'exiting-cover': {
        const id = e.id;
        const sid = e.subjectId ?? null;
        adapters.playExitCover({
          id,
          subjectId: sid,
          onOpaque: () => machine.reportPageOpaque(id),
          onProgress: () => {},
          onCleared: () => machine.reportPageCleared(id),
          onSettled: () => {},
        });
        hubPrep = Promise.resolve()
          .then(() => adapters.prepareHub(sid, id))
          .then(() => {
            if (machine.id() === id) machine.reportHubPrepared(id);
          })
          .catch((err) => {
            console.error('prepareHub failed', err);
            if (machine.id() === id) machine.reportFailed(id, 'hub-error');
          });
        break;
      }
      case 'exiting-book':
        adapters.beginReturnBook?.({ id: e.id, subjectId: e.subjectId ?? null });
        break;
      case 'hub-visible':
        adapters.showHub(e.subjectId ?? null);
        break;
      case 'hub-interactive':
        adapters.enableHub?.();
        break;
      case 'neutral-cover': {
        const id = e.id;
        if (adapters.playNeutralCover) {
          adapters.playNeutralCover({
            id,
            subjectId: e.subjectId ?? null,
            onOpaque: () => machine.reportNeutralCoverOpaque(id),
          });
        } else {
          // 无中性遮罩实现时，立即放行（仍保持 id 语义）
          queueMicrotask(() => machine.reportNeutralCoverOpaque(id));
        }
        break;
      }
      case 'failed-cover':
        adapters.onFailed?.(e.subjectId ?? null, e.reason || 'unknown');
        break;
      case 'settled':
        adapters.onSettled?.({ id: e.id });
        break;
      case 'theme-commit':
        adapters.commitTheme?.(e.themeId);
        break;
      default:
        break;
    }
  }

  return {
    machine,
    /** @param {string} subjectId */
    requestEnter(subjectId) {
      return machine.requestEnter(subjectId);
    },
    requestReturn() {
      return machine.requestReturn();
    },
    /** @param {string} themeId */
    requestTheme(themeId) {
      machine.requestTheme(themeId);
    },
    phase: () => machine.phase(),
    id: () => machine.id(),
    activeId: () => activeId,
    /** 调试/测试用 */
    _labPrep: () => labPrep,
    _hubPrep: () => hubPrep,
  };
}
