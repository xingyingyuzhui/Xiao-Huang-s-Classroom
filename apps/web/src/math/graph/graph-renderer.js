/**
 * GraphRenderer：doc diff 与各 layer 的增量投影。
 *
 * - computeGraphRenderPlan：纯 diff，输出最小 add/update/remove 集合与拓扑顺序。
 * - createGraphRuntimeSyncAdapter：Task 4 的全量同步适配器（Task 7 切换增量后退役）。
 * - 函数 layer 的增量应用在 function-layer.js。
 */

import { constructionsDependingOn } from './construction/dependency-closure.js';

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
 * 把 store candidate 文档投影到既有函数 runtime。
 * 适配器不拥有文档真值；只负责让画板/UI 与文档一致。
 *
 * @param {{
 *   getState: () => any,
 *   detachFnCurve: (fn: any) => void,
 *   mirrorActiveToLegacy: () => void,
 *   rebuildCurve: () => void,
 *   scheduleCurveRebuild: () => void,
 *   renderFnList: () => void,
 *   syncParamPanel: () => void,
 *   paintReadouts: () => void,
 * }} context
 * @returns {(ctx: { previous: any, candidate: any, preview?: boolean }) => { ok: boolean }}
 */
export function createGraphRuntimeSyncAdapter(context) {
  return function syncRuntimeFromDocument(ctx) {
    const state = context.getState();
    const doc = ctx.candidate;
    if (!doc || !Array.isArray(doc.functions)) return { ok: false };

    // 删除文档中不存在的函数（先 detach 曲线再移除引用）
    const byId = new Map(doc.functions.map((fn) => [fn.id, fn]));
    for (const rec of state.functions.slice()) {
      if (!byId.has(rec.id)) context.detachFnCurve(rec);
    }

    // 同步 / 新增函数记录（保留既有 curve 运行时引用）
    state.functions = doc.functions.map((dfn) => {
      const existing = state.functions.find((fn) => fn.id === dfn.id);
      if (existing) {
        Object.assign(existing, dfn);
        return existing;
      }
      return { ...dfn };
    });
    state.activeFnId =
      doc.presentation?.activeFunctionId ?? state.functions[0]?.id ?? null;
    context.mirrorActiveToLegacy();

    if (ctx.preview) {
      // 事务 preview：曲线帧合并，UI 读数即时同步
      context.scheduleCurveRebuild();
    } else {
      context.rebuildCurve();
    }
    context.renderFnList();
    context.syncParamPanel();
    context.paintReadouts();
    return { ok: true };
  };
}
