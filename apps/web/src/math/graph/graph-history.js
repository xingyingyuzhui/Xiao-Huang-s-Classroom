/**
 * GraphHistory：有界、可合并、排除批注的撤销/重做历史。
 *
 * - 历史只记录结构文档（functions/points/constructions/view/presentation）的 before/after，
 *   始终排除 annotations；恢复时与“当前 annotations”合并。
 * - 参数滑杆等事务只产生一条记录；no-op 与 meta.record=false 不入栈。
 * - 自身不持久化、不序列化；undo/redo 通过 dispatch history/restore 恢复，
 *   由 reducer 以 document/replace 语义应用，且不会再被本模块记录。
 */

/**
 * 结构快照（剔除 annotations 与 meta）。
 * 保留 schemaVersion / id / title，避免 undo 后 autosave 丢身份字段而重走 legacy 迁移。
 * @param {any} document
 */
function structuralSnapshot(document) {
  return {
    schemaVersion: document.schemaVersion,
    id: document.id,
    title: document.title,
    functions: document.functions,
    points: document.points,
    constructions: document.constructions,
    view: document.view,
    presentation: document.presentation,
  };
}

/** @param {any} document */
function structuralKey(document) {
  return JSON.stringify(structuralSnapshot(document));
}

/**
 * @param {any} store
 * @param {{ limit?: number }} [options]
 */
export function createGraphHistory(store, options = {}) {
  const limit = Number.isInteger(options.limit) ? options.limit : 100;
  /** @type {Array<{ before: object, after: object }>} */
  const undoStack = [];
  /** @type {Array<{ before: object, after: object }>} */
  const redoStack = [];
  /** @type {Set<(state: { canUndo: boolean, canRedo: boolean }) => void>} */
  const listeners = new Set();

  /** @param {{ canUndo: boolean, canRedo: boolean }} [state] */
  function notify(state) {
    const next = state || {
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
    };
    for (const listener of [...listeners]) {
      try {
        listener(next);
      } catch {
        /* listener errors must not break history */
      }
    }
  }

  /** @param {any} previous @param {any} current */
  function record(previous, current) {
    if (previous === current) return;
    if (structuralKey(previous) === structuralKey(current)) return;
    undoStack.push({
      before: structuralSnapshot(previous),
      after: structuralSnapshot(current),
    });
    if (undoStack.length > limit) undoStack.shift();
    redoStack.length = 0;
    notify();
  }

  const unsubscribe = store.subscribe((event) => {
    if (event.action?.meta?.record === false) return;
    if (event.action?.type === 'history/restore') return;
    if (event.action?.type === 'transaction/cancel') return;
    record(event.previous, event.current);
  });

  /** 恢复目标结构快照，与当前批注合并；meta 保持当前文档。 @param {object} target @returns {boolean} */
  function restoreDocument(target) {
    const current = store.getDocument();
    const result = store.dispatch({
      type: 'history/restore',
      payload: {
        document: {
          ...current,
          ...target,
          annotations: current.annotations,
          meta: current.meta,
        },
      },
      meta: { record: false },
    });
    // dispatch 失败时返回 previous（与目标结构不同）→ 不移动栈
    return Boolean(result) && structuralKey(result) === structuralKey(target);
  }

  return {
    /** @returns {boolean} 仅在 restore 成功后才移动栈 */
    undo() {
      const entry = undoStack.at(-1);
      if (!entry) return false;
      if (!restoreDocument(entry.before)) return false;
      undoStack.pop();
      redoStack.push(entry);
      notify();
      return true;
    },

    /** @returns {boolean} 仅在 restore 成功后才移动栈 */
    redo() {
      const entry = redoStack.at(-1);
      if (!entry) return false;
      if (!restoreDocument(entry.after)) return false;
      redoStack.pop();
      undoStack.push(entry);
      notify();
      return true;
    },

    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,

    clear() {
      undoStack.length = 0;
      redoStack.length = 0;
      notify();
    },

    /**
     * @param {(state: { canUndo: boolean, canRedo: boolean }) => void} listener
     * @returns {() => void}
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispose() {
      unsubscribe();
      listeners.clear();
      undoStack.length = 0;
      redoStack.length = 0;
    },
  };
}
