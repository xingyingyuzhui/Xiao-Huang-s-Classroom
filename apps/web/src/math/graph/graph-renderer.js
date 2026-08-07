/**
 * GraphRenderer：doc diff 与各 layer 的增量投影。
 *
 * - computeGraphRenderPlan：纯 diff，输出最小 add/update/remove 集合与拓扑顺序。
 * - createGraphRuntimeSyncAdapter：Task 4 的全量同步适配器（Task 7 切换增量后退役）。
 * - 函数 layer 的增量应用在 function-layer.js。
 */

import { constructionsDependingOn } from './construction/dependency-closure.js';
import { constructionDocumentRecord } from './construction/restore.js';

export { applyFunctionPlan } from './function-layer.js';

/** @param {any} a @param {any} b */
function recordsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 按 id 计算记录数组的 add/update/remove。
 * @param {any[]} beforeList
 * @param {any[]} afterList
 */
function diffRecords(beforeList, afterList) {
  const beforeById = new Map(beforeList.map((record) => [record.id, record]));
  const afterById = new Map(afterList.map((record) => [record.id, record]));
  const add = [];
  const update = [];
  const remove = [];
  for (const [id, record] of afterById) {
    if (!beforeById.has(id)) {
      add.push(record);
    } else if (!recordsEqual(beforeById.get(id), record)) {
      update.push({ id, record });
    }
  }
  for (const [id] of beforeById) {
    if (!afterById.has(id)) remove.push(id);
  }
  return { add, update, remove };
}

/**
 * 纯 render diff：给定 previous/current 文档，输出增量计划与拓扑顺序。
 *
 * 拓扑约定：
 * - remove：下游构造 → 点 → 函数（constructions → points → functions）
 * - add：上游 → 下游（functions → points → constructions）
 * - 同一 id 不允许同时出现在 add 与 remove。
 *
 * @param {any} previous
 * @param {any} current
 */
export function computeGraphRenderPlan(previous, current) {
  const functions = diffRecords(previous.functions || [], current.functions || []);
  const points = diffRecords(previous.points || [], current.points || []);
  const constructions = diffRecords(
    previous.constructions || [],
    current.constructions || [],
  );

  const viewChanged = !recordsEqual(previous.view || {}, current.view || {});
  const activeFunctionChanged =
    previous.presentation?.activeFunctionId !== current.presentation?.activeFunctionId;

  // 被 update 的函数 → 依赖它的构造需要刷新（数值重算/位置重算）
  const dependencyRefreshIds = [];
  for (const { id } of functions.update) {
    for (const constrId of constructionsDependingOn(current.constructions || [], id)) {
      if (!dependencyRefreshIds.includes(constrId)) dependencyRefreshIds.push(constrId);
    }
  }

  const removeOrder = [
    ...constructions.remove,
    ...points.remove,
    ...functions.remove,
  ];
  const addOrder = [
    ...functions.add.map((record) => record.id),
    ...points.add.map((record) => record.id),
    ...constructions.add.map((record) => record.id),
  ];

  return {
    functions,
    points,
    constructions,
    viewChanged,
    activeFunctionChanged,
    dependencyRefreshIds,
    addOrder,
    removeOrder,
  };
}

/**
 * 把 store candidate 文档投影到既有 runtime（plan 驱动，增量）。
 *
 * 适配器不拥有文档真值；只负责让画板/UI 与文档一致。要点：
 * - 参数变化只重建“变化的那条函数曲线”及其依赖（跟随点 → 交点 → 构造），
 *   不得清空全部用户点和构造（Task 7 不变量）。
 * - 点/构造按文档记录增删（layer 幂等：工具已创建的 runtime 对象不重复建）。
 * - 视口变化由 applyView 回写 board，配合 viewApplying guard 防止反馈回环。
 *
 * @param {{
 *   getState: () => any,
 *   createFnCurve: (fn: any) => void,
 *   detachFnCurve: (fn: any) => void,
 *   detachFunctionDependents: (fnId: string) => void,
 *   rebindFunctionDependents: (fnId: string, doc: any) => void,
 *   refreshActiveMarks: () => void,
 *   mirrorActiveToLegacy: () => void,
 *   pointLayer: any,
 *   constructionLayer: any,
 *   applyView: (view: any) => void,
 *   renderFnList: () => void,
 *   syncParamPanel: () => void,
 *   paintReadouts: () => void,
 * }} context
 * @returns {(ctx: { previous: any, candidate: any, preview?: boolean }) => { ok: boolean }}
 */
/**
 * 把 render plan 投影到既有 runtime（增量；失败由 production renderer 全量恢复）。
 * 适配器不拥有文档真值；只负责让画板/UI 与文档一致。
 * @param {any} context
 * @param {any} plan
 * @param {{ previous: any, candidate: any, action: any, preview?: boolean }} ctx
 */
export function applyGraphRuntimePlan(context, plan, ctx) {
  const state = context.getState();
  const doc = ctx.candidate;
  if (!doc || !Array.isArray(doc.functions)) return { ok: false };

  // ── 1) 函数：remove → add → update（依赖按序重绑） ──
    for (const id of plan.functions.remove) {
      context.detachFunctionDependents(id);
      const record = state.functions.find((fn) => fn.id === id);
      context.detachFnCurve(record);
    }
    state.functions = doc.functions.map((dfn) => {
      const existing = state.functions.find((fn) => fn.id === dfn.id);
      if (existing) {
        Object.assign(existing, dfn);
        return existing;
      }
      return { ...dfn };
    });
    for (const record of plan.functions.add) {
      const fn = state.functions.find((f) => f.id === record.id);
      if (fn && !fn.curve) context.createFnCurve(fn);
    }
    for (const { id } of plan.functions.update) {
      const fn = state.functions.find((f) => f.id === id);
      if (!fn) continue;
      // 变化的那一条曲线重建；先卸依赖对象（跟随点/交点/构造），重建后按文档恢复
      context.detachFunctionDependents(id);
      context.detachFnCurve(fn);
      if (fn.visible) {
        context.createFnCurve(fn);
        // 依赖只在曲线存在时恢复；隐藏期间保持卸下，避免跟随点悬浮/重建失败
        context.rebindFunctionDependents(id, doc);
      }
      // 活动函数显隐切换：刷新特征点/渐近线（隐藏时清除，显示时重绘）
      if (id === state.activeFnId && 'visible' in (ctx.action?.payload?.patch || {})) {
        context.refreshActiveMarks();
      }
    }

    state.activeFnId =
      doc.presentation?.activeFunctionId ?? state.functions[0]?.id ?? null;
    context.mirrorActiveToLegacy();
    if (plan.activeFunctionChanged) context.refreshActiveMarks();

    // ── 2) 点：按文档记录增删（layer 幂等） ──
    for (const record of plan.points.add) context.pointLayer.add(record);
    for (const { record } of plan.points.update) context.pointLayer.update(record);
    for (const id of plan.points.remove) context.pointLayer.remove(id);

    // ── 3) 构造（样式补丁经 action.payload.style 原位投影） ──
    for (const record of plan.constructions.add) context.constructionLayer.add(record);
    for (const record of plan.constructions.update) {
      context.constructionLayer.update(record, ctx.action?.payload?.style);
    }
    for (const id of plan.constructions.remove) context.constructionLayer.remove(id);

    // ── 4) 视口（applyView 自带防回环 guard） ──
    if (plan.viewChanged) context.applyView(doc.view);

    // ── 5) 参考曲线（compare.reference，签名防抖由调用方负责） ──
    context.applyReference?.(doc);

    context.renderFnList();
    context.syncParamPanel();
    context.paintReadouts();
    return { ok: true };
}

/**
 * @param {{
 *   getState: () => any,
 *   createFnCurve: (fn: any) => void,
 *   detachFnCurve: (fn: any) => void,
 *   detachFunctionDependents: (fnId: string) => void,
 *   rebindFunctionDependents: (fnId: string, doc: any) => void,
 *   refreshActiveMarks: () => void,
 *   mirrorActiveToLegacy: () => void,
 *   pointLayer: any,
 *   constructionLayer: any,
 *   applyView: (view: any) => void,
 *   renderFnList: () => void,
 *   syncParamPanel: () => void,
 *   paintReadouts: () => void,
 * }} context
 * @returns {(ctx: { previous: any, candidate: any, preview?: boolean }) => { ok: boolean }}
 */
export function createGraphRuntimeSyncAdapter(context) {
  return function syncRuntimeFromDocument(ctx) {
    const plan = computeGraphRenderPlan(ctx.previous, ctx.candidate);
    return applyGraphRuntimePlan(context, plan, ctx);
  };
}

/** @param {number[]} a @param {number[]} b */
export function arraysNearEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((value, i) => Math.abs(Number(value) - Number(b[i])) < 1e-9);
}

/**
 * 特征卡：把 label 列宽统一为最长项，保证竖线对齐（跨行 max-content）。
 * @param {HTMLElement | null} el
 */
export function alignFeatureLabelWidths(el) {
  if (!el) return;
  let w = 0;
  for (const row of el.querySelectorAll('.math-float-feat-row > strong')) {
    w = Math.max(w, row.getBoundingClientRect().width);
  }
  if (w > 0) el.style.setProperty('--feat-label-w', `${Math.ceil(w)}px`);
}

/**
 * 视口桥接：文档 view/update 的 apply（防回环 guard）+ board boundingbox → 文档。
 * @param {{
 *   getBoard: () => any,
 *   getStore: () => any,
 *   getState: () => any,
 * }} context
 */
export function createGraphViewBridge(context) {
  let txTimer = null;
  return {
    /** 由 adapter 回写 bbox 时抑制 boundingbox 监听器再 dispatch */
    applyViewFromDocument(view) {
      const board = context.getBoard();
      if (!board) return;
      const bb = view?.boundingBox;
      if (!Array.isArray(bb) || bb.length < 4) return;
      let current = null;
      try {
        current = board.getBoundingBox();
      } catch {
        return;
      }
      if (current && arraysNearEqual(bb, current)) return;
      context.getState().viewApplying = true;
      try {
        board.setBoundingBox(bb, false);
      } catch {
        /* best-effort viewport apply */
      } finally {
        context.getState().viewApplying = false;
      }
    },

    /** 视口平移/缩放：250ms 静默窗口合并成一条历史 */
    openViewTransaction() {
      const state = context.getState();
      if (txTimer != null) {
        clearTimeout(txTimer);
      } else {
        context.getStore()?.beginTransaction();
      }
      txTimer = window.setTimeout(() => {
        txTimer = null;
        context.getStore()?.commitTransaction();
      }, 250);
    },

    onBoardBoundingBox() {
      const state = context.getState();
      if (state.viewApplying) return;
      const store = context.getStore();
      const board = context.getBoard();
      if (!store || !board) return;
      let bb = null;
      try {
        bb = board.getBoundingBox();
      } catch {
        return;
      }
      if (!bb) return;
      const currentDoc = store.getDocument();
      if (currentDoc?.view?.boundingBox && arraysNearEqual(bb, currentDoc.view.boundingBox)) {
        return;
      }
      this.openViewTransaction();
      store.dispatch({ type: 'view/update', payload: { patch: { boundingBox: bb } } });
    },

    dispose() {
      if (txTimer != null) {
        clearTimeout(txTimer);
        txTimer = null;
        context.getStore()?.cancelTransaction();
      }
    },
  };
}

/**
 * 工具对象提交桥接：runtime 点/构造 → 文档（幂等），删除经 store 级联。
 * fn×fn 交点在文档模型中由 GraphPoint.constraint 承载，不保存 intersection 构造。
 * @param {{
 *   getStore: () => any,
 *   getPointsCtrl: () => any,
 *   getState: () => any,
 *   fallbackDeleteUserPoint: (el: any) => void,
 *   fallbackDeleteConstruction: (cid: string) => void,
 * }} context
 */
export function createGraphCommitBridge(context) {
  return {
    commitPointDocument(rec) {
      const store = context.getStore();
      if (!store || !rec) return;
      const docRecord = context.getPointsCtrl().documentRecordOf(rec);
      if (docRecord) {
        store.dispatch({ type: 'point/add', payload: { point: docRecord } });
      }
    },

    commitConstructionDocument(rec) {
      const store = context.getStore();
      if (!store || !rec) return;
      if (rec.kind === 'intersect' && rec.fnIds?.length === 2 && !rec.lineIds?.length) return;
      const docRecord = constructionDocumentRecord(rec);
      if (docRecord) {
        store.dispatch({ type: 'construction/add', payload: { construction: docRecord } });
      }
    },

    removeUserPointById(id) {
      if (!id) return;
      const store = context.getStore();
      if (!store) {
        const rec = context.getState().userPoints.find((r) => r.id === id);
        if (rec) context.fallbackDeleteUserPoint(rec.el);
        return;
      }
      store.dispatch({ type: 'point/removeCascade', payload: { id } });
    },

    removeConstructionById(cid) {
      if (!cid) return;
      const store = context.getStore();
      if (!store) {
        context.fallbackDeleteConstruction(cid);
        return;
      }
      const inDocument = store.getDocument().constructions.some((c) => c.id === cid);
      if (!inDocument) {
        // 文档外的 runtime-only 构造（自动交点等）直删
        context.fallbackDeleteConstruction(cid);
        return;
      }
      store.dispatch({ type: 'construction/removeCascade', payload: { id: cid } });
    },
  };
}
