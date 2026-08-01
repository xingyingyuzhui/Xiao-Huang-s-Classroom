/**
 * GraphRuntime：JSXGraph runtime registry，不可序列化。
 *
 * 职责：按文档 id 管理 layer handle（els/disposers/evaluator/dependencyIds），
 * 提供 get/set/delete/clear；文档本身永不写入 board/element。
 */

import { createFunctionEvaluatorCache } from './function-evaluator.js';

/**
 * @returns {{ curve: any, evaluator: ReturnType<typeof createFunctionEvaluatorCache> }}
 */
export function createGraphRuntimeSidecar() {
  return {
    curve: null,
    evaluator: createFunctionEvaluatorCache(),
  };
}

/**
 * 按文档 id 管理 layer handle 的 registry。
 * 删除/清空时每个 handle 的 disposer 只执行一次。
 */
export function createGraphRuntimeRegistry() {
  /** @type {Map<string, any>} */
  const handles = new Map();
  return {
    /** @param {string} id */
    get(id) {
      return handles.get(id) || null;
    },
    /**
     * @param {string} id
     * @param {any} handle
     */
    set(id, handle) {
      handles.set(id, handle);
    },
    /** @param {string} id */
    delete(id) {
      const handle = handles.get(id);
      if (handle) {
        try {
          handle.dispose?.();
        } catch {
          /* best-effort teardown */
        }
        handles.delete(id);
      }
    },
    /** @param {string} id */
    has(id) {
      return handles.has(id);
    },
    size() {
      return handles.size;
    },
    /** @returns {string[]} */
    keys() {
      return [...handles.keys()];
    },
    clear() {
      for (const id of [...handles.keys()]) this.delete(id);
    },
  };
}

/**
 * 构造 layer handle：els / disposers / evaluator / dependencyIds。
 * @param {{
 *   els?: Set<any>,
 *   disposers?: Array<() => void>,
 *   evaluator?: any,
 *   dependencyIds?: Set<string>,
 *   update?: (record: any, context?: any) => void,
 *   dispose?: () => void,
 * }} [parts]
 */
export function createGraphLayerHandle(parts = {}) {
  const els = parts.els || new Set();
  const disposers = parts.disposers || [];
  return {
    els,
    disposers: new Set(disposers),
    evaluator: parts.evaluator ?? null,
    dependencyIds: parts.dependencyIds || new Set(),
    update: parts.update || (() => {}),
    dispose() {
      try {
        parts.dispose?.();
      } catch {
        /* best-effort teardown */
      }
      for (const disposer of [...this.disposers]) {
        try {
          disposer();
        } catch {
          /* a failing disposer must not block the rest */
        }
      }
      this.disposers.clear();
      els.clear();
    },
  };
}

