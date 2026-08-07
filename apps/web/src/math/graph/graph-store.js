/**
 * GraphStore：纯 reducer + 两阶段发布 store + 事务。
 *
 * - reducer 是纯函数：不访问 DOM / localStorage / 时间 API，不修改输入。
 * - 无效 id / no-op patch 返回原对象引用。
 * - 删除点或函数时由纯级联规则决定受影响构造（复用 constructionRemovalOrder）。
 * - store 两阶段发布：reducer 算出 candidate → beforeCommit（renderer）成功后才发布。
 */

import { constructionsDependingOn } from './construction/dependency-closure.js';

/** @param {any} a @param {any} b */
function shallowEqual(a, b) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => Object.is(a[key], b[key]));
}

/**
 * 按下游优先顺序删除引用 rootId 的构造（含传递引用）。
 * @param {any} document
 * @param {string} rootId
 * @param {{ includeRoot?: boolean }} [options] includeRoot 用于删除构造本身
 * @returns {any} 构造已删除的文档（无引用时返回原文档引用）
 */
function removeConstructionsClosure(document, rootId, options = {}) {
  const removal = constructionsDependingOn(document.constructions, rootId);
  const doomed = new Set(options.includeRoot ? [rootId, ...removal] : removal);
  if (!doomed.size) return document;
  return {
    ...document,
    constructions: document.constructions.filter((c) => !doomed.has(c.id)),
  };
}

/**
 * 点约束是否依赖指定函数（跟随曲线/特征点/交点）。
 * @param {any} point
 * @param {string} functionId
 */
function pointDependsOnFunction(point, functionId) {
  const constraint = point?.constraint;
  if (!constraint || typeof constraint !== 'object') return false;
  if (constraint.kind === 'followFunction' || constraint.kind === 'followFeature') {
    return constraint.functionId === functionId;
  }
  if (constraint.kind === 'intersection') {
    return Array.isArray(constraint.targetIds) && constraint.targetIds.includes(functionId);
  }
  return false;
}

/**
 * @param {any} document
 * @param {object} action
 */
export function reduceGraphDocument(document, action) {
  if (!document || typeof document !== 'object') return document;
  if (!action || typeof action !== 'object') return document;

  switch (action.type) {
    case 'function/add': {
      const fn = action.payload?.function;
      if (!fn || typeof fn !== 'object' || typeof fn.id !== 'string' || !fn.id) return document;
      if (fn.kind !== 'preset' && fn.kind !== 'custom') return document;
      if (document.functions.some((f) => f.id === fn.id)) return document;
      return {
        ...document,
        functions: [...document.functions, fn],
        presentation: { ...document.presentation, activeFunctionId: fn.id },
      };
    }

    case 'function/update': {
      const { id, patch } = action.payload || {};
      const index = document.functions.findIndex((f) => f.id === id);
      if (index < 0 || !patch || typeof patch !== 'object') return document;
      const before = document.functions[index];
      const next = { ...before, ...patch };
      if (shallowEqual(before, next)) return document;
      const functions = document.functions.slice();
      functions[index] = next;
      return { ...document, functions };
    }

    case 'function/duplicate': {
      // 复制：插入原函数之后；数组位置是唯一顺序真值
      const fn = action.payload?.function;
      const sourceId = action.payload?.sourceId;
      if (!fn || typeof fn !== 'object' || typeof fn.id !== 'string' || !fn.id) {
        return document;
      }
      if (fn.kind !== 'preset' && fn.kind !== 'custom') return document;
      if (document.functions.some((f) => f.id === fn.id)) return document;
      const index = document.functions.findIndex((f) => f.id === sourceId);
      const at = index < 0 ? document.functions.length : index + 1;
      const functions = document.functions.slice();
      functions.splice(at, 0, fn);
      return {
        ...document,
        functions,
        presentation: { ...document.presentation, activeFunctionId: fn.id },
      };
    }

    case 'function/remove': {
      const id = action.payload?.id;
      if (!document.functions.some((f) => f.id === id)) return document;
      // 级联：引用该函数的构造 + 约束依赖该函数的点（及其下游构造）
      let next = removeConstructionsClosure(document, id);
      const doomedPoints = next.points
        .filter((point) => pointDependsOnFunction(point, id))
        .map((point) => point.id);
      for (const pointId of doomedPoints) {
        next = removeConstructionsClosure(next, pointId);
      }
      if (doomedPoints.length) {
        const doomed = new Set(doomedPoints);
        next = {
          ...next,
          points: next.points.filter((point) => !doomed.has(point.id)),
        };
      }
      const functions = next.functions.filter((f) => f.id !== id);
      const presentation =
        next.presentation?.activeFunctionId === id
          ? {
              ...next.presentation,
              activeFunctionId: functions.length ? functions[0].id : null,
            }
          : next.presentation;
      return { ...next, functions, presentation };
    }

    case 'function/reorder': {
      const ids = action.payload?.ids;
      if (!Array.isArray(ids)) return document;
      const currentIds = document.functions.map((f) => f.id);
      if (ids.length !== currentIds.length) return document;
      const byId = new Map(document.functions.map((f) => [f.id, f]));
      for (const id of ids) {
        if (!byId.has(id)) return document;
      }
      if (ids.every((id, i) => id === currentIds[i])) return document;
      return { ...document, functions: ids.map((id) => byId.get(id)) };
    }

    case 'point/add': {
      const point = action.payload?.point;
      if (!point || typeof point !== 'object' || typeof point.id !== 'string' || !point.id) {
        return document;
      }
      if (document.points.some((p) => p.id === point.id)) return document;
      return { ...document, points: [...document.points, point] };
    }

    case 'point/update': {
      const { id, patch } = action.payload || {};
      const index = document.points.findIndex((p) => p.id === id);
      if (index < 0 || !patch || typeof patch !== 'object') return document;
      const before = document.points[index];
      const next = { ...before, ...patch };
      if (shallowEqual(before, next)) return document;
      const points = document.points.slice();
      points[index] = next;
      return { ...document, points };
    }

    case 'point/removeCascade': {
      const id = action.payload?.id;
      if (!document.points.some((p) => p.id === id)) return document;
      const withoutConstructions = removeConstructionsClosure(document, id);
      return {
        ...withoutConstructions,
        points: withoutConstructions.points.filter((p) => p.id !== id),
      };
    }

    case 'construction/add': {
      const construction = action.payload?.construction;
      if (
        !construction ||
        typeof construction !== 'object' ||
        typeof construction.id !== 'string' ||
        !construction.id ||
        typeof construction.kind !== 'string' ||
        !construction.kind
      ) {
        return document;
      }
      if (document.constructions.some((c) => c.id === construction.id)) return document;
      return { ...document, constructions: [...document.constructions, construction] };
    }

    case 'construction/update': {
      const { id, patch } = action.payload || {};
      const index = document.constructions.findIndex((c) => c.id === id);
      if (index < 0 || !patch || typeof patch !== 'object') return document;
      const before = document.constructions[index];
      const next = { ...before, ...patch };
      if (shallowEqual(before, next)) return document;
      const constructions = document.constructions.slice();
      constructions[index] = next;
      return { ...document, constructions };
    }

    case 'construction/removeCascade': {
      const id = action.payload?.id;
      if (!document.constructions.some((c) => c.id === id)) return document;
      return removeConstructionsClosure(document, id, { includeRoot: true });
    }

    case 'view/update': {
      const patch = action.payload?.patch;
      if (!patch || typeof patch !== 'object') return document;
      const nextView = { ...document.view, ...patch };
      if (shallowEqual(document.view, nextView)) return document;
      return { ...document, view: nextView };
    }

    case 'presentation/update': {
      const patch = action.payload?.patch;
      if (!patch || typeof patch !== 'object') return document;
      const nextPresentation = { ...document.presentation, ...patch };
      if (shallowEqual(document.presentation, nextPresentation)) return document;
      return { ...document, presentation: nextPresentation };
    }

    case 'annotations/replace': {
      const annotations = action.payload?.annotations;
      if (!annotations || typeof annotations !== 'object') return document;
      if (document.annotations === annotations) return document;
      return { ...document, annotations };
    }

    case 'document/replace': {
      const replacement = action.payload?.document;
      if (!replacement || typeof replacement !== 'object') return document;
      if (replacement === document) return document;
      return replacement;
    }

    case 'history/restore': {
      // 历史恢复：与 document/replace 同语义，但 action 带 record:false 标记
      const replacement = action.payload?.document;
      if (!replacement || typeof replacement !== 'object') return document;
      if (replacement === document) return document;
      return replacement;
    }

    default:
      return document;
  }
}

/**
 * @param {any} initialDocument
 * @param {{ beforeCommit?: (ctx: any) => { ok: boolean } | void }} [options]
 */
export function createGraphStore(initialDocument, options = {}) {
  const beforeCommit =
    typeof options.beforeCommit === 'function'
      ? options.beforeCommit
      : () => ({ ok: true });

  let current = initialDocument;
  /** @type {Set<(event: any) => void>} */
  const listeners = new Set();
  /** @type {{ previous: any, candidate: any } | null} */
  let transaction = null;

  /** @param {any} previous @param {object} action @param {boolean} isTransaction */
  function notify(previous, action, isTransaction) {
    const event = { previous, current, action, transaction: isTransaction };
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        /* listener errors must not break the store */
      }
    }
  }

  /**
   * 提交 candidate；beforeCommit 失败则丢弃并返回原文档。
   * @param {object} action
   * @param {any} candidate
   * @param {any} previous
   */
  function publish(action, candidate, previous) {
    if (candidate === previous) {
      notify(previous, action, false);
      return candidate;
    }
    let check;
    try {
      check = beforeCommit({ previous, candidate, action });
    } catch {
      check = { ok: false };
    }
    if (!check || check.ok === false) return previous;
    current = candidate;
    notify(previous, action, false);
    return candidate;
  }

  return {
    getDocument: () => current,

    /**
     * @param {object} action
     */
    dispatch(action) {
      if (transaction) {
        // 事务内：reducer 计算 preview candidate，允许 renderer 看到 preview，
        // 但不修改 current、不通知 subscriber。
        const preview = reduceGraphDocument(transaction.candidate, action);
        if (preview === transaction.candidate) return transaction.candidate;
        let check;
        try {
          check = beforeCommit({
            previous: transaction.previous,
            candidate: preview,
            action,
            preview: true,
          });
        } catch {
          check = { ok: false };
        }
        if (!check || check.ok === false) return transaction.candidate;
        transaction.candidate = preview;
        return preview;
      }
      const previous = current;
      const candidate = reduceGraphDocument(previous, action);
      return publish(action, candidate, previous);
    },

    /**
     * @param {(event: { previous: any, current: any, action: object, transaction: boolean }) => void} listener
     * @returns {() => void}
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    replaceDocument(nextDocument) {
      if (!nextDocument || typeof nextDocument !== 'object') return current;
      const previous = current;
      const action = { type: 'document/replace', payload: { document: nextDocument } };
      if (nextDocument === previous) {
        notify(previous, action, false);
        return current;
      }
      return publish(action, nextDocument, previous);
    },

    beginTransaction() {
      if (transaction) return;
      transaction = { previous: current, candidate: current };
    },

    commitTransaction() {
      if (!transaction) return current;
      const { previous, candidate } = transaction;
      transaction = null;
      if (candidate === previous) return current;
      const action = { type: 'transaction/commit', meta: { transaction: true } };
      const published = publish(action, candidate, previous);
      return published === candidate ? candidate : current;
    },

    cancelTransaction() {
      if (!transaction) return current;
      // preview 期间 board 可能已按 candidate 投影；cancel 后 document 仍是 previous，
      // 必须把 runtime 从 lastPreview 拉回 previous，否则 dispose/取消后板面与文档分叉。
      const lastPreview = transaction.candidate;
      const start = transaction.previous;
      transaction = null;
      if (lastPreview !== start) {
        try {
          beforeCommit({
            previous: lastPreview,
            candidate: start,
            action: { type: 'transaction/cancel', meta: { transaction: true } },
          });
        } catch {
          /* best-effort runtime restore */
        }
      }
      notify(current, { type: 'transaction/cancel', meta: { transaction: true } }, true);
      return current;
    },

    dispose() {
      listeners.clear();
      transaction = null;
    },
  };
}
