/**
 * 全局历史控制器：撤销/重做按钮、快捷键与批注路由。
 *
 * 全部依赖注入：eventTarget / root / history / notes / isEditableTarget，
 * 可用 fake 目标做纯 DOM 测试。
 */

/** @param {EventTarget | null} target */
export function defaultIsEditableTarget(target) {
  const element = /** @type {Element | null} */ (target);
  if (!element || typeof element.tagName !== 'string') return false;
  const tag = element.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  return element.isContentEditable === true;
}

/**
 * @param {{
 *   eventTarget: { addEventListener: (type: string, fn: any) => void, removeEventListener: (type: string, fn: any) => void },
 *   root: { querySelector: (sel: string) => any } | null,
 *   history: { canUndo: () => boolean, canRedo: () => boolean, undo: () => any, redo: () => any, subscribe: (fn: any) => () => void },
 *   notes?: { isActive?: () => boolean, undo?: () => any } | null,
 *   isEditableTarget?: (target: EventTarget | null) => boolean,
 * }} options
 */
export function createGraphHistoryController(options) {
  const {
    eventTarget,
    root,
    history,
    notes = null,
    isEditableTarget = defaultIsEditableTarget,
  } = options;

  const undoButton = root?.querySelector?.('[data-graph-history-undo]') || null;
  const redoButton = root?.querySelector?.('[data-graph-history-redo]') || null;

  /** 同步按钮可用状态 */
  function sync() {
    const canUndo = history.canUndo();
    const canRedo = history.canRedo();
    if (undoButton) {
      undoButton.disabled = !canUndo;
      if (typeof undoButton.setAttribute === 'function') {
        undoButton.setAttribute('aria-disabled', String(!canUndo));
      }
    }
    if (redoButton) {
      redoButton.disabled = !canRedo;
      if (typeof redoButton.setAttribute === 'function') {
        redoButton.setAttribute('aria-disabled', String(!canRedo));
      }
    }
  }

  function routeUndo() {
    if (notes?.isActive?.()) {
      notes.undo?.();
      return;
    }
    history.undo();
  }

  function routeRedo() {
    history.redo();
  }

  /** @param {KeyboardEvent} event */
  function onKeyDown(event) {
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === 'z') {
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      if (event.shiftKey) routeRedo();
      else routeUndo();
      return;
    }
    // Ctrl+Y（不含 Cmd+Y）
    if (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey) {
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      routeRedo();
    }
  }

  function onClickUndo() {
    routeUndo();
  }

  function onClickRedo() {
    routeRedo();
  }

  eventTarget.addEventListener('keydown', onKeyDown);
  undoButton?.addEventListener?.('click', onClickUndo);
  redoButton?.addEventListener?.('click', onClickRedo);
  const unsubscribe = history.subscribe(sync);
  sync();

  return {
    sync,
    dispose() {
      eventTarget.removeEventListener('keydown', onKeyDown);
      undoButton?.removeEventListener?.('click', onClickUndo);
      redoButton?.removeEventListener?.('click', onClickRedo);
      unsubscribe();
    },
  };
}
