/**
 * GraphRenderer：doc diff 与各 layer 的增量投影。
 *
 * Task 4 阶段提供文档 → 既有 runtime 的全量同步适配器（beforeCommit），
 * 证明 store 两阶段发布链路；Task 6 将替换为按 layer 的增量 render plan。
 */

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
