/**
 * GraphFunctionRuntime：函数曲线与活动特征点/渐近线的投影。
 *
 * 通过注入工作（board/evaluator/theme/state 访问器），不拥有文档真值；
 * 曲线颜色经 resolveFunctionColor 动态解析（换肤不修改文档）。
 */

import { keyFeatures } from './model.js';
import { resolveFunctionColor } from '../shared/math-theme.js';
import { resolveFunctionSampleRange } from './function-records.js';

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
 * }} context
 */
export function createGraphFunctionRuntime(context) {
  const { getState, evalFnY, colors, activeFn } = context;

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
    context.clearExtras(board);
    const c = colors();
    const act = activeFn();
    if (!act || act.visible === false) return;
    if (act?.kind === 'preset' && act.preset) {
      const preset = act.preset;
      const coeffs = act.coeffs;
      for (const asy of context.asymptotes(preset, coeffs)) {
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
          label: context.boardLabelAttrs({
            offset: labelOffset,
            strokeColor: c.ink,
            color: c.ink,
          }),
        });
        pt._mathBaseName = name;
        pt._mathShowCoords = true;
        pt._mathCanFollow = false;
        pt._mathFeatureMark = true;
        context.applyBoardLabel(pt, {
          baseName: name,
          text: () => context.formatElementCoordsLabel(pt, name),
          offset: labelOffset,
        });
        state.marks.push(pt);
      }
    }
    context.schedulePointLabelFusion();
  }

  function refreshActiveMarks() {
    paintActiveFeatureMarks();
  }

  return { createFnCurve, detachFnCurve, removeAllFnCurves, paintActiveFeatureMarks, refreshActiveMarks };
}
