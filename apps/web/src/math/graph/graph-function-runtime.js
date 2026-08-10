/**
 * GraphFunctionRuntime：函数曲线与活动特征点/渐近线的投影。
 *
 * 通过注入工作（board/evaluator/theme/state 访问器），不拥有文档真值；
 * 曲线颜色经 resolveFunctionColor 动态解析（换肤不修改文档）。
 */

import { keyFeatures } from './model.js';
import { resolveFunctionColor } from '../shared/math-theme.js';
import { resolveFunctionSampleRange } from './function-records.js';
import { detachBoardObject } from '../shared/board-lifecycle.js';

/**
 * @param {{
 *   getState: () => any,
 *   evalFnY: (fn: any, x: number) => number | null,
 *   colors: () => any,
 *   activeFn: () => any,
 *   boardLabelAttrs: (opts: any) => any,
 *   applyBoardLabel: (el: any, opts: any) => void,
 *   formatElementCoordsLabel: (el: any, name: string) => string,
 *   asymptotes: (preset: string, coeffs: any) => any[],
 *   clearExtras: (board: any) => void,
 *   schedulePointLabelFusion: () => void,
 *   curveRebuildTask: any,
 *   withPreservedViewport: (board: any, fn: () => void) => void,
 *   snapshotUserPoints: () => any[],
 *   snapshotConstructions: (host: any) => any[],
 *   clearAllConstructions: (host: any) => void,
 *   removeUserPointEls: () => void,
 *   restoreUserPoints: (saved: any[]) => void,
 *   restoreConstructions: (host: any, saved: any[], opts?: any) => void,
 *   autoIntersectNewLine: (host: any, rec: any) => void,
 *   lineLikeElOf: (rec: any) => any,
 *   reregisterSelectable: () => void,
 *   renderFnList: () => void,
 *   syncParamPanel: () => void,
 *   paintReadouts: () => void,
 *   mirrorActiveToLegacy: () => void,
 *   makeDrawHost: () => any,
 * }} context
 */
export function createGraphFunctionRuntime(context) {
  const {
    getState,
    evalFnY,
    colors,
    activeFn,
    curveRebuildTask,
    withPreservedViewport,
    snapshotUserPoints,
    snapshotConstructions,
    clearAllConstructions,
    removeUserPointEls,
    restoreUserPoints,
    restoreConstructions,
    autoIntersectNewLine,
    lineLikeElOf,
    reregisterSelectable,
    renderFnList,
    syncParamPanel,
    paintReadouts,
    mirrorActiveToLegacy,
    boardLabelAttrs,
    applyBoardLabel,
    formatElementCoordsLabel,
    asymptotes,
    clearExtras,
    schedulePointLabelFusion,
    makeDrawHost,
  } = context;

  /** 参考曲线签名防抖（实例级；dispose 时由 resetReferenceKey 清空） */
  let lastReferenceKey = null;

  /** 创建单条函数曲线（增量路径与全量重建共用；隐藏函数不建） */
  function createFnCurve(fn) {
    const state = getState();
    const board = state.board;
    if (!board || !fn || !fn.visible) return null;
    const c = colors();
    const [xLo, xHi] = resolveFunctionSampleRange(fn, state.fXMin, state.fXMax);
    const stroke = resolveFunctionColor(fn);
    const curve = board.create(
      'functiongraph',
      [
        (x) => {
          const y = evalFnY(fn, x);
          return y == null ? NaN : y;
        },
        xLo,
        xHi,
      ],
      {
        strokeColor: stroke,
        strokeWidth: fn.id === state.activeFnId ? 3.2 : 2.4,
        name: fn.id,
      },
    );
    fn.curve = curve;
    curve._mathFnId = fn.id;
    return curve;
  }

  /** 从画板卸掉某条函数曲线（删除前必须先调，避免 filter 后变成幽灵曲线） */
  function detachFnCurve(fn) {
    if (!fn) return;
    const state = getState();
    if (fn.curve) {
      try {
        state.board?.removeObject?.(fn.curve);
      } catch {
        /* partially disposed board */
      }
      fn.curve = null;
    }
  }

  function removeAllFnCurves() {
    const state = getState();
    for (const fn of state.functions.slice()) detachFnCurve(fn);
  }

  /** 重绘活动预设函数的特征点/渐近线（先清除旧 marks；隐藏时只清除） */
  function paintActiveFeatureMarks() {
    const state = getState();
    const board = state.board;
    if (!board) return;
    clearExtras(board);
    const c = colors();
    const act = activeFn();
    if (!act || act.visible === false) return;
    if (act?.kind === 'preset' && act.preset) {
      const preset = act.preset;
      const coeffs = act.coeffs;
      for (const asy of asymptotes(preset, coeffs)) {
        state.asy.push(
          board.create(
            'line',
            asy.type === 'vertical'
              ? [
                  [asy.value, -20],
                  [asy.value, 20],
                ]
              : [
                  [-20, asy.value],
                  [20, asy.value],
                ],
            {
              straightFirst: true,
              straightLast: true,
              strokeColor: c.diagram,
              dash: 2,
              strokeWidth: 1.5,
              name: asy.label || '渐近线',
            },
          ),
        );
      }
      /** @type {Array<{ x: number, y: number, kinds: string[] }>} */
      const markSlots = [];
      const MERGE_EPS = 1e-6;
      for (const feat of keyFeatures(preset, coeffs)) {
        if (feat.x == null || feat.y == null) continue;
        if (!Number.isFinite(feat.x) || !Number.isFinite(feat.y)) continue;
        const kind = String(feat.kind || '点');
        const hit = markSlots.find(
          (s) => Math.hypot(s.x - feat.x, s.y - feat.y) <= MERGE_EPS,
        );
        if (hit) {
          if (!hit.kinds.includes(kind)) hit.kinds.push(kind);
        } else {
          markSlots.push({ x: feat.x, y: feat.y, kinds: [kind] });
        }
      }
      for (const slot of markSlots) {
        const atOrigin = Math.hypot(slot.x, slot.y) <= MERGE_EPS;
        let name = slot.kinds.join('·');
        if (atOrigin) {
          const hasV = slot.kinds.includes('顶点');
          const hasZ = slot.kinds.includes('零点');
          if (hasV && hasZ) name = '顶点·零点（原点）';
          else if (hasV) name = '顶点（原点）';
          else if (hasZ) name = '零点（原点）';
          else if (slot.kinds.includes('截距')) name = `${slot.kinds.join('·')}（原点）`;
        }
        const labelOffset = atOrigin ? [14, 16] : [14, 14];
        const pt = board.create('point', [slot.x, slot.y], {
          name,
          size: 4,
          fillColor: c.diagram,
          strokeColor: c.pointRing,
          fixed: true,
          withLabel: true,
          label: boardLabelAttrs({
            offset: labelOffset,
            strokeColor: c.ink,
            color: c.ink,
          }),
        });
        pt._mathBaseName = name;
        pt._mathShowCoords = true;
        pt._mathCanFollow = false;
        pt._mathFeatureMark = true;
        applyBoardLabel(pt, {
          baseName: name,
          text: () => formatElementCoordsLabel(pt, name),
          offset: labelOffset,
        });
        state.marks.push(pt);
      }
    }
    schedulePointLabelFusion();
  }

  function refreshActiveMarks() {
    paintActiveFeatureMarks();
  }

  function rebuildCurve() {
    const state = getState();
    curveRebuildTask.cancel();
    const board = state.board;
    if (!board) return;
    // 生命周期：重建包 withPreservedViewport，避免镜头被图例/fullUpdate 打回
    withPreservedViewport(board, () => {
      const savedUsers = snapshotUserPoints();
      const savedConstr = snapshotConstructions(makeDrawHost());
      clearAllConstructions(makeDrawHost());
      removeUserPointEls();
      clearExtras(board);
      removeAllFnCurves(board);
      state.curve = null;

      for (const fn of state.functions) {
        createFnCurve(fn);
      }

      mirrorActiveToLegacy();
      paintActiveFeatureMarks();

      restoreUserPoints(savedUsers);
      restoreConstructions(makeDrawHost(), savedConstr, { notify: false });
      // 曲线重建后：补齐线/垂线与函数的交点（已有则跳过）
      {
        const host = makeDrawHost();
        for (const rec of host.getConstructions().slice()) {
          if (!rec || rec.kind === 'intersect') continue;
          if (!lineLikeElOf(rec)) continue;
          try {
            autoIntersectNewLine(host, rec);
          } catch {
            /* */
          }
        }
      }
      reregisterSelectable();
      renderFnList();
      syncParamPanel();
      paintReadouts();
      try {
        board.update();
      } catch {
        /* */
      }
      schedulePointLabelFusion();
      try {
        // refresh 契约：skipViewport，不重置镜头
        board._mathAxisLegend?.refresh?.();
      } catch {
        /* */
      }
    });
  }

  /** 参考曲线：同色虚线低透明度；签名不变则跳过重建。 */
  function applyReferenceCurveFromDocument(doc) {
    const state = getState();
    const ref = doc?.presentation?.compare?.reference;
    const board = state.board;
    if (!board) return;
    const key = ref
      ? JSON.stringify({ kind: ref.kind, preset: ref.preset, expr: ref.expr, coeffs: ref.coeffs })
      : null;
    if (key === lastReferenceKey) return;
    lastReferenceKey = key;
    if (state.referenceCurve) {
      detachBoardObject(board, state.referenceCurve);
      state.referenceCurve = null;
    }
    if (!ref) return;
    const xLo = Math.min(
      Number.isFinite(state.fXMin) ? state.fXMin : -10,
      Number.isFinite(state.fXMax) ? state.fXMax : 10,
    );
    const xHi = Math.max(
      Number.isFinite(state.fXMin) ? state.fXMin : -10,
      Number.isFinite(state.fXMax) ? state.fXMax : 10,
    );
    try {
      state.referenceCurve = board.create(
        'functiongraph',
        [
          (x) => {
            const y = evalFnY(ref, x);
            return y == null ? NaN : y;
          },
          xLo,
          xHi,
        ],
        {
          strokeColor: resolveFunctionColor(ref),
          strokeWidth: 2,
          dash: 3,
          strokeOpacity: 0.45,
          highlight: false,
          withLabel: false,
          name: '参考曲线',
        },
      );
    } catch {
      state.referenceCurve = null;
    }
  }

  function resetReferenceKey() {
    lastReferenceKey = null;
  }

  return {
    rebuildCurve,
    createFnCurve,
    detachFnCurve,
    removeAllFnCurves,
    paintActiveFeatureMarks,
    refreshActiveMarks,
    applyReferenceCurveFromDocument,
    resetReferenceKey,
  };
}
