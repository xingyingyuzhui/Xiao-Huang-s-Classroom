/**
 * GraphDocumentRenderer：production beforeCommit / fullRender / recover。
 *
 * 单向合同：Store 只把经过校验的 candidate 交给本模块投影；本模块在
 * 发布前完成可回滚投影。任一步失败 → fullRender(previous) 恢复完整
 * runtime；fullRender 也失败 → fatal 状态，拒绝后续 action。
 *
 * 增量原则：
 * 1. 函数曲线先创建隐藏 staged handle，全部可创建后再替换旧曲线；
 * 2. 点/构造的 add 在依赖就绪后创建（失败由 fullRender 兜底）；
 * 3. remove 按依赖逆序（下游先删）。
 *
 * fullRender 是恢复安全网，只允许用于：首次 mount、document replace、
 * schema migration、增量 rollback。
 */

/**
 * @param {{
 *   getState: () => any,
 *   createFnCurve: (fn: any) => void,
 *   detachFnCurve: (fn: any) => void,
 *   detachFunctionDependents: (fnId: string) => void,
 *   rebindFunctionDependents: (fnId: string, doc: any) => void,
 *   clearAllRuntime: () => void,
 *   pointLayer: any,
 *   constructionLayer: any,
 *   refreshActiveMarks: () => void,
 *   mirrorActiveToLegacy: () => void,
 *   applyView: (view: any) => void,
 *   applyReference: (doc: any) => void,
 *   renderFnList: () => void,
 *   syncParamPanel: () => void,
 *   paintReadouts: () => void,
 *   computePlan: (previous: any, candidate: any) => any,
 *   applyIncremental: (plan: any, previous: any, candidate: any, action: any, preview: boolean) => void,
 *   onFatal?: (reason: string) => void,
 * }} context
 */
export function createGraphDocumentRenderer(context) {
  /** @type {'ready' | 'applying' | 'recovering' | 'fatal'} */
  let status = 'ready';
  let fatalReason = '';

  /**
   * 确定性全量渲染：清空全部 runtime，按文档拓扑重建。
   * @param {any} document
   */
  function fullRender(document) {
    if (!document || !Array.isArray(document.functions)) return { ok: false };
    const previousStatus = status;
    status = 'recovering';
    try {
      context.clearAllRuntime();
      const state = context.getState();
      state.functions = document.functions.map((fn) => ({ ...fn }));
      state.activeFnId =
        document.presentation?.activeFunctionId ?? state.functions[0]?.id ?? null;
      for (const fn of state.functions) context.createFnCurve(fn);
      context.mirrorActiveToLegacy();
      for (const rec of document.points || []) context.pointLayer.add(rec);
      for (const rec of document.constructions || []) context.constructionLayer.add(rec);
      context.refreshActiveMarks();
      context.applyView?.(document.view);
      context.applyReference?.(document);
      context.renderFnList();
      context.syncParamPanel();
      context.paintReadouts();
      status = 'ready';
      return { ok: true };
    } catch (error) {
      status = 'fatal';
      fatalReason = `FULL_RENDER_FAILED: ${String(error?.message || error)}`;
      context.onFatal?.(fatalReason);
      return { ok: false, fatal: true };
    }
  }

  /**
   * production beforeCommit：增量投影；失败先尝试 fullRender(previous)。
   * @param {{ previous: any, candidate: any, action: any, preview?: boolean }} ctx
   */
  function beforeCommit(ctx) {
    const { previous, candidate, action, preview } = ctx;
    if (status === 'fatal') return { ok: false, code: 'RENDER_FAILED' };
    status = 'applying';
    try {
      const plan = context.computePlan(previous, candidate);
      context.applyIncremental(plan, previous, candidate, action, Boolean(preview));
      status = 'ready';
      return { ok: true };
    } catch (error) {
      // 增量失败：先尝试把 runtime 恢复为 previous
      const recovery = fullRender(previous);
      if (!recovery.ok) {
        // fullRender 也失败 → fatal，不再接受修改
        return { ok: false, code: 'RENDER_FAILED' };
      }
      status = 'ready';
      return { ok: false, code: 'RENDER_FAILED' };
    }
  }

  return {
    beforeCommit,
    fullRender,
    /** 恢复 = 全量渲染安全网（fatal 时唯一出口由外部重建 board 决定） */
    recover(document) {
      const result = fullRender(document);
      if (!result.ok) {
        status = 'fatal';
        fatalReason = 'RECOVER_FAILED';
        context.onFatal?.(fatalReason);
      }
      return result;
    },
    getStatus: () => status,
    getFatalReason: () => fatalReason,
    dispose() {
      status = 'ready';
      fatalReason = '';
    },
  };
}
