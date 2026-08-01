/** 线与线、线与函数交点的 JSXGraph 渲染工厂。 */

import {
  applyBoardLabel,
  bindLiveLabel,
  boardLabelAttrs,
  ensurePointGeomHook,
  formatElementCoordsLabel,
} from '../../shared/board-label.js';
import { getMathBoardChrome } from '../../shared/math-theme.js';
import { lineLineIntersectionCoords } from './geometry.js';
import { bindConstructionDependency } from './dependencies.js';
import { bindIntersectVisibility } from './intersection-lifecycle.js';
import { findLineFnHitNumeric } from './intersection-numeric.js';
import {
  constrIsInfinite,
  pointLiesOnConstr,
} from './records.js';

/**
 * @typedef {'segment' | 'line' | 'tangent' | 'perp' | 'intersect'} ConstrKind
 *
 * @typedef {{
 *   id: string,
 *   kind: ConstrKind,
 *   pointIds?: string[],
 *   fnId?: string | null,
 *   axis?: 'x' | 'y',
 *   perpTarget?: 'axis' | 'line' | 'normal' | 'curve',
 *   targetConstrId?: string,
 *   fnIds?: [string, string],
 *   lineIds?: [string, string] | [string],
 *   intersectIndex?: number,
 *   label?: string,
 *   extend?: boolean,
 *   els: any[],
 * }} ConstrRec
 *
 * @typedef {{
 *   getBoard: () => any,
 *   getUserPoints: () => Array<{ id: string, el: any }>,
 *   getFunctions: () => Array<{ id: string, curve: any, visible: boolean }>,
 *   getConstructions: () => ConstrRec[],
 *   setConstructions: (list: ConstrRec[]) => void,
 *   findUserEl: (id: string) => any,
 *   findConstr: (id: string) => ConstrRec | null,
 *   evalFnY: (fn: any, x: number) => number | null,
 *   findFnByCurve: (curve: any) => any,
 *   recomputeIntersection: (idA: string, idB: string, x: number, y: number) => { x: number, y: number } | null,
 *   createUserPoint: (x: number, y: number, opts?: object) => any,
 *   nextConstrId: () => string,
 *   listSnapTargets?: () => Array<{ x: number, y: number, el?: any }>,
 *   onChanged?: () => void,
 * }} DrawHost
 */

/**
 * 线与函数曲线的交点（JSXGraph intersection；失败则数值兜底）
 * @param {DrawHost} host
 * @param {any} lineEl
 * @param {any} fn
 * @param {string} lineConstrId
 * @param {string} fnId
 * @param {number} [index=0]
 * @param {string} [id]
 * @param {{ notify?: boolean }} [options]
 */
export function createLineFnIntersection(host, lineEl, fn, lineConstrId, fnId, index = 0, id, options = {}) {
  const board = host.getBoard();
  if (!board || !lineEl || !fn?.curve) return null;
  const c = getMathBoardChrome();

  /** @type {any} */
  let pt = null;
  try {
    pt = board.create('intersection', [lineEl, fn.curve, index], {
      name: '交点',
      size: 4,
      fillColor: c.stamp,
      strokeColor: c.pointRing,
      withLabel: true,
      label: boardLabelAttrs({
        strokeColor: c.ink,
        color: c.ink,
      }),
    });
    const x = Number(pt.X());
    const y = Number(pt.Y());
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      try {
        board.removeObject(pt);
      } catch {
        /* */
      }
      pt = null;
    }
  } catch {
    pt = null;
  }

  // 数值兜底：扫视口找 f(x)=L(x)
  if (!pt && index === 0) {
    const lineRec = host.findConstr(lineConstrId);
    const hit = findLineFnHitNumeric(host, lineEl, fn, {
      allowBeyond: constrIsInfinite(lineRec),
      // 传入的可能是 segment；若是支撑 line 也按作图是否有限约束
      forceFinite: !constrIsInfinite(lineRec),
    });
    if (!hit) return null;
    try {
      pt = board.create('point', [hit.x, hit.y], {
        name: '交点',
        size: 4,
        fillColor: c.stamp,
        strokeColor: c.pointRing,
        withLabel: true,
        fixed: true,
        label: boardLabelAttrs({
          strokeColor: c.ink,
          color: c.ink,
        }),
      });
    } catch {
      return null;
    }
  }
  if (!pt) return null;

  pt._mathConstr = true;
  pt._mathConstrKind = 'intersect';
  pt._mathBaseName = '交点';
  pt._mathShowCoords = true;
  const getText = () => formatElementCoordsLabel(pt, '交点');
  applyBoardLabel(pt, {
    baseName: '交点',
    text: getText,
    color: c.ink,
  });
  bindLiveLabel(pt, getText);

  // 线段/垂线默认不含延长线交点；创建后绑定显隐（拖动端点滑出线段时隐藏）
  try {
    const x = Number(pt.X());
    const y = Number(pt.Y());
    const lineRec = host.findConstr(lineConstrId);
    if (!pointLiesOnConstr(lineRec, x, y)) {
      try {
        board.removeObject(pt);
      } catch {
        /* */
      }
      return null;
    }
  } catch {
    try {
      board.removeObject(pt);
    } catch {
      /* */
    }
    return null;
  }

  const rec = {
    id: id || host.nextConstrId(),
    kind: /** @type {ConstrKind} */ ('intersect'),
    lineIds: /** @type {[string]} */ ([lineConstrId]),
    fnIds: /** @type {[string]} */ ([fnId]),
    intersectIndex: index,
    els: [pt],
    label: '交点',
  };
  pt._mathConstrId = rec.id;
  host.getConstructions().push(rec);
  bindIntersectVisibility(host, rec, pt, rec.lineIds);
  if (options.notify !== false) host.onChanged?.();
  return rec;
}

/**
 * @param {DrawHost} host
 * @param {any} lineA
 * @param {any} lineB
 * @param {[string, string]} lineIds
 * @param {string} [id]
 * @param {{ notify?: boolean }} [options]
 */
export function createLineIntersection(host, lineA, lineB, lineIds, id, options = {}) {
  const board = host.getBoard();
  if (!board || !lineA || !lineB) return null;
  const c = getMathBoardChrome();
  const ids = /** @type {[string, string]} */ ([...lineIds]);

  /** @returns {{ x: number, y: number } | null} */
  const computeRaw = () => {
    const raw = lineLineIntersectionCoords(lineA, lineB);
    if (!raw) return null;
    const recA = host.findConstr(ids[0]);
    const recB = host.findConstr(ids[1]);
    if (!pointLiesOnConstr(recA, raw.x, raw.y) || !pointLiesOnConstr(recB, raw.x, raw.y)) {
      return null;
    }
    return raw;
  };

  /** @type {any} */
  let pt = null;

  const initial = computeRaw();
  if (!initial) return null;

  // 用函数坐标点：随端点移动更新（保持几何精确位置，不做格点吸附）
  pt = board.create(
    'point',
    [
      () => {
        const hit = computeRaw();
        return hit ? hit.x : NaN;
      },
      () => {
        const hit = computeRaw();
        return hit ? hit.y : NaN;
      },
    ],
    {
      name: '交点',
      size: 4,
      fillColor: c.stamp,
      strokeColor: c.pointRing,
      withLabel: true,
      fixed: true,
      label: boardLabelAttrs({
        strokeColor: c.ink,
        color: c.ink,
      }),
    },
  );

  pt._mathConstr = true;
  pt._mathConstrKind = 'intersect';
  pt._mathBaseName = '交点';
  pt._mathShowCoords = true;
  pt._mathIntersectLocked = true;
  pt._mathIntersectComputeRaw = computeRaw;
  const getText = () => formatElementCoordsLabel(pt, '交点');
  applyBoardLabel(pt, {
    baseName: '交点',
    text: getText,
    color: c.ink,
  });
  bindLiveLabel(pt, getText);
  const rec = {
    id: id || host.nextConstrId(),
    kind: /** @type {ConstrKind} */ ('intersect'),
    lineIds: ids,
    els: [pt],
    label: '交点',
  };
  pt._mathConstrId = rec.id;
  host.getConstructions().push(rec);
  bindIntersectVisibility(host, rec, pt, /** @type {string[]} */ ([...ids]));
  // 端点拖动时刷新标签 / 显隐
  for (const lineEl of [lineA, lineB]) {
    for (const p of [lineEl?.point1, lineEl?.point2]) {
      if (!p) continue;
      const tick = () => {
        try {
          pt._mathIntersectVisTick?.();
          pt._mathLiveLabelTick?.();
        } catch {
          /* */
        }
      };
      bindConstructionDependency(rec, p, tick);
      ensurePointGeomHook(p);
    }
  }
  if (options.notify !== false) host.onChanged?.();
  return rec;
}
