/**
 * 函数画布作图对象：线段 / 直线 / 切线 / 轴垂线 / 交点
 * 与 rebuildCurve 协作：snapshot → clear → restore
 */

import { detachBoardObject } from '../shared/board-lifecycle.js';
import {
  applyBoardLabel,
  bindLiveLabel,
  boardLabelAttrs,
  formatNamedCoords,
  formatSmartNumber,
} from '../shared/board-label.js';
import { getMathBoardChrome } from '../shared/math-theme.js';

/**
 * @typedef {'segment' | 'line' | 'tangent' | 'perp' | 'intersect'} ConstrKind
 *
 * @typedef {{
 *   id: string,
 *   kind: ConstrKind,
 *   pointIds?: string[],
 *   fnId?: string | null,
 *   axis?: 'x' | 'y',
 *   fnIds?: [string, string],
 *   lineIds?: [string, string],
 *   label?: string,
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
 *   onChanged?: () => void,
 * }} DrawHost
 */

/**
 * @param {ConstrRec} rec
 * @param {any} board
 */
export function detachConstr(rec, board) {
  if (!rec?.els?.length) return;
  for (const el of rec.els) {
    detachBoardObject(board, el);
  }
  rec.els = [];
}

/**
 * @param {DrawHost} host
 */
export function clearAllConstructions(host) {
  const board = host.getBoard();
  const list = host.getConstructions().slice();
  for (const rec of list) detachConstr(rec, board);
  host.setConstructions([]);
}

/**
 * @param {ConstrRec} rec
 */
function snapshotMeta(rec) {
  return {
    id: rec.id,
    kind: rec.kind,
    pointIds: rec.pointIds ? [...rec.pointIds] : undefined,
    fnId: rec.fnId ?? null,
    axis: rec.axis,
    fnIds: rec.fnIds ? [...rec.fnIds] : undefined,
    lineIds: rec.lineIds ? [...rec.lineIds] : undefined,
    label: rec.label,
  };
}

/**
 * @param {DrawHost} host
 */
export function snapshotConstructions(host) {
  return host.getConstructions().map(snapshotMeta);
}

/**
 * @param {DrawHost} host
 * @param {ReturnType<typeof snapshotMeta>[]} saved
 */
export function restoreConstructions(host, saved) {
  clearAllConstructions(host);
  for (const meta of saved || []) {
    try {
      recreateConstr(host, meta);
    } catch (err) {
      console.warn('[graph-draw] restore failed', meta?.kind, err);
    }
  }
  host.onChanged?.();
}

/**
 * @param {DrawHost} host
 * @param {ReturnType<typeof snapshotMeta>} meta
 */
function recreateConstr(host, meta) {
  if (!meta?.kind) return null;
  if (meta.kind === 'segment' || meta.kind === 'line') {
    const a = host.findUserEl(meta.pointIds?.[0] || '');
    const b = host.findUserEl(meta.pointIds?.[1] || '');
    if (!a || !b) return null;
    return createSegmentOrLine(host, meta.kind, a, b, meta.pointIds, meta.id);
  }
  if (meta.kind === 'tangent') {
    const pt = host.findUserEl(meta.pointIds?.[0] || '');
    const fn = host.getFunctions().find((f) => f.id === meta.fnId);
    if (!pt || !fn?.curve) return null;
    return createTangent(host, pt, fn, meta.pointIds?.[0], meta.id);
  }
  if (meta.kind === 'perp') {
    const pt = host.findUserEl(meta.pointIds?.[0] || '');
    if (!pt || (meta.axis !== 'x' && meta.axis !== 'y')) return null;
    return createPerpToAxis(host, pt, meta.axis, meta.pointIds?.[0], meta.id);
  }
  if (meta.kind === 'intersect') {
    if (meta.fnIds?.length === 2) {
      // 交点点体已由 userPoints 恢复；此处只登记元数据
      const rec = {
        id: meta.id || host.nextConstrId(),
        kind: /** @type {ConstrKind} */ ('intersect'),
        fnIds: /** @type {[string, string]} */ ([meta.fnIds[0], meta.fnIds[1]]),
        pointIds: meta.pointIds ? [...meta.pointIds] : [],
        els: [],
        label: '交点',
      };
      host.getConstructions().push(rec);
      return rec;
    }
    if (meta.lineIds?.length === 2) {
      const L1 = host.findConstr(meta.lineIds[0]);
      const L2 = host.findConstr(meta.lineIds[1]);
      const lineA = L1?.els?.find((e) => isLineLike(e));
      const lineB = L2?.els?.find((e) => isLineLike(e));
      if (!lineA || !lineB) return null;
      return createLineIntersection(host, lineA, lineB, meta.lineIds, meta.id);
    }
  }
  return null;
}

/**
 * @param {any} p1
 * @param {any} p2
 */
function segmentLengthText(p1, p2) {
  try {
    const len = Math.hypot(Number(p1.X()) - Number(p2.X()), Number(p1.Y()) - Number(p2.Y()));
    return `长 ${formatSmartNumber(len)}`;
  } catch {
    return '长 —';
  }
}

/**
 * @param {any} p1
 * @param {any} p2
 */
function lineSlopeText(p1, p2) {
  try {
    const dx = Number(p2.X()) - Number(p1.X());
    const dy = Number(p2.Y()) - Number(p1.Y());
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return '直线';
    if (Math.abs(dx) < 1e-9) return '直线 · 竖直线';
    return `直线 · k=${formatSmartNumber(dy / dx)}`;
  } catch {
    return '直线';
  }
}

/**
 * @param {DrawHost} host
 * @param {'segment'|'line'} kind
 * @param {any} p1
 * @param {any} p2
 * @param {string[]} pointIds
 * @param {string} [id]
 */
export function createSegmentOrLine(host, kind, p1, p2, pointIds, id) {
  const board = host.getBoard();
  if (!board || !p1 || !p2) return null;
  const c = getMathBoardChrome();
  const type = kind === 'segment' ? 'segment' : 'line';
  const getText =
    kind === 'segment' ? () => segmentLengthText(p1, p2) : () => lineSlopeText(p1, p2);
  const el = board.create(type, [p1, p2], {
    strokeColor: c.stamp,
    strokeWidth: 2,
    straightFirst: kind === 'line',
    straightLast: kind === 'line',
    withLabel: true,
    name: kind === 'segment' ? '线段' : '直线',
    label: boardLabelAttrs({
      offset: [8, -12],
      strokeColor: c.ink,
      color: c.ink,
    }),
  });
  el._mathConstr = true;
  el._mathConstrKind = kind;
  applyBoardLabel(el, {
    baseName: kind === 'segment' ? '线段' : '直线',
    text: getText,
    offset: [8, -12],
    color: c.ink,
  });
  bindLiveLabel(el, getText, [p1, p2]);
  const rec = {
    id: id || host.nextConstrId(),
    kind,
    pointIds: [...pointIds],
    els: [el],
    label: kind === 'segment' ? '线段' : '直线',
  };
  el._mathConstrId = rec.id;
  host.getConstructions().push(rec);
  host.onChanged?.();
  return rec;
}

/**
 * @param {DrawHost} host
 * @param {any} pt
 * @param {any} fn
 * @param {string} pointId
 * @param {string} [id]
 */
export function createTangent(host, pt, fn, pointId, id) {
  const board = host.getBoard();
  if (!board || !pt || !fn?.curve) return null;
  const c = getMathBoardChrome();

  const slopeAt = (x) => {
    const h = 1e-4;
    const ya = host.evalFnY(fn, x - h);
    const yb = host.evalFnY(fn, x + h);
    if (ya == null || yb == null) return 0;
    return (yb - ya) / (2 * h);
  };
  const yAt = (x) => {
    const y = host.evalFnY(fn, x);
    return y == null ? Number(pt.Y()) : y;
  };

  // 用两个动态隐藏点撑起直线（比直接塞函数坐标对更稳）
  const pA = board.create(
    'point',
    [() => Number(pt.X()), () => yAt(Number(pt.X()))],
    { visible: false, withLabel: false, fixed: true },
  );
  const pB = board.create(
    'point',
    [
      () => Number(pt.X()) + 1,
      () => {
        const x = Number(pt.X());
        return yAt(x) + slopeAt(x);
      },
    ],
    { visible: false, withLabel: false, fixed: true },
  );
  const line = board.create('line', [pA, pB], {
    strokeColor: c.diagram,
    strokeWidth: 2.2,
    withLabel: true,
    name: '切线',
    label: boardLabelAttrs({
      offset: [8, -12],
      strokeColor: c.ink,
      color: c.ink,
    }),
  });
  line._mathConstr = true;
  line._mathConstrKind = 'tangent';
  pA._mathConstr = true;
  pB._mathConstr = true;
  const getText = () => {
    const k = slopeAt(Number(pt.X()));
    if (!Number.isFinite(k)) return '切线';
    return `切线 · k=${formatSmartNumber(k)}`;
  };
  applyBoardLabel(line, {
    baseName: '切线',
    text: getText,
    offset: [8, -12],
    color: c.ink,
  });
  bindLiveLabel(line, getText, [pt]);
  const rec = {
    id: id || host.nextConstrId(),
    kind: /** @type {ConstrKind} */ ('tangent'),
    pointIds: [pointId],
    fnId: fn.id,
    els: [pA, pB, line],
    label: '切线',
  };
  line._mathConstrId = rec.id;
  pA._mathConstrId = rec.id;
  pB._mathConstrId = rec.id;
  host.getConstructions().push(rec);
  host.onChanged?.();
  return rec;
}

/**
 * @param {DrawHost} host
 * @param {any} pt
 * @param {'x'|'y'} axis
 * @param {string} pointId
 * @param {string} [id]
 */
export function createPerpToAxis(host, pt, axis, pointId, id) {
  const board = host.getBoard();
  if (!board || !pt) return null;
  const c = getMathBoardChrome();
  const footCoords = () => {
    try {
      const x = axis === 'x' ? Number(pt.X()) : 0;
      const y = axis === 'x' ? 0 : Number(pt.Y());
      return formatNamedCoords('H', x, y);
    } catch {
      return 'H';
    }
  };
  const foot =
    axis === 'x'
      ? board.create(
          'point',
          [() => pt.X(), () => 0],
          {
            name: 'H',
            size: 3,
            fillColor: c.diagram,
            strokeColor: c.pointRing,
            withLabel: true,
            fixed: true,
            label: boardLabelAttrs({
              strokeColor: c.ink,
              color: c.ink,
            }),
          },
        )
      : board.create(
          'point',
          [() => 0, () => pt.Y()],
          {
            name: 'H',
            size: 3,
            fillColor: c.diagram,
            strokeColor: c.pointRing,
            withLabel: true,
            fixed: true,
            label: boardLabelAttrs({
              strokeColor: c.ink,
              color: c.ink,
            }),
          },
        );
  foot._mathConstr = true;
  foot._mathConstrKind = 'perp';
  foot._mathCanFollow = false;
  foot._mathUserPoint = false;
  foot._mathBaseName = 'H';
  foot._mathShowCoords = true;
  applyBoardLabel(foot, {
    baseName: 'H',
    text: footCoords,
    color: c.ink,
  });
  bindLiveLabel(foot, footCoords, [pt]);

  const segText = () => {
    const axisTag = axis === 'x' ? '⊥x' : '⊥y';
    return `${axisTag} · ${segmentLengthText(pt, foot)}`;
  };
  const seg = board.create('segment', [pt, foot], {
    strokeColor: c.diagram,
    strokeWidth: 1.6,
    dash: 2,
    withLabel: true,
    name: '垂线',
    label: boardLabelAttrs({
      offset: [8, -10],
      strokeColor: c.ink,
      color: c.ink,
    }),
  });
  seg._mathConstr = true;
  seg._mathConstrKind = 'perp';
  applyBoardLabel(seg, {
    baseName: axis === 'x' ? '⊥x' : '⊥y',
    text: segText,
    offset: [8, -10],
    color: c.ink,
  });
  bindLiveLabel(seg, segText, [pt, foot]);

  const rec = {
    id: id || host.nextConstrId(),
    kind: /** @type {ConstrKind} */ ('perp'),
    pointIds: [pointId],
    axis,
    els: [foot, seg],
    label: axis === 'x' ? '垂线→x' : '垂线→y',
  };
  foot._mathConstrId = rec.id;
  seg._mathConstrId = rec.id;
  host.getConstructions().push(rec);
  host.onChanged?.();
  return rec;
}

/**
 * @param {DrawHost} host
 * @param {string} idA
 * @param {string} idB
 * @param {string} [id]
 */
export function createFnIntersection(host, idA, idB, id) {
  const board = host.getBoard();
  const fns = host.getFunctions();
  const fa = fns.find((f) => f.id === idA);
  const fb = fns.find((f) => f.id === idB);
  if (!board || !fa || !fb) return null;

  /** @type {{ x: number, y: number } | null} */
  let hit = null;
  const seeds = [-6, -3, -1, 0, 1, 3, 6, -8, 8, -2, 2, 4, -4];
  for (const s of seeds) {
    hit = host.recomputeIntersection(idA, idB, s, 0);
    if (hit) break;
  }
  if (!hit) return null;
  const recPt = host.createUserPoint(hit.x, hit.y, {
    intersectFnIds: [idA, idB],
    showCoords: true,
  });
  if (!recPt) return null;
  const rec = {
    id: id || host.nextConstrId(),
    kind: /** @type {ConstrKind} */ ('intersect'),
    fnIds: /** @type {[string, string]} */ ([idA, idB]),
    pointIds: [recPt.id],
    els: [],
    label: '交点',
  };
  host.getConstructions().push(rec);
  host.onChanged?.();
  return rec;
}

/**
 * @param {DrawHost} host
 * @param {any} lineA
 * @param {any} lineB
 * @param {[string, string]} lineIds
 * @param {string} [id]
 */
export function createLineIntersection(host, lineA, lineB, lineIds, id) {
  const board = host.getBoard();
  if (!board || !lineA || !lineB) return null;
  const c = getMathBoardChrome();
  const pt = board.create('intersection', [lineA, lineB, 0], {
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
  pt._mathConstr = true;
  pt._mathConstrKind = 'intersect';
  pt._mathBaseName = '交点';
  pt._mathShowCoords = true;
  const getText = () => {
    try {
      return formatNamedCoords('交点', Number(pt.X()), Number(pt.Y()));
    } catch {
      return '交点';
    }
  };
  applyBoardLabel(pt, {
    baseName: '交点',
    text: getText,
    color: c.ink,
  });
  bindLiveLabel(pt, getText);
  const rec = {
    id: id || host.nextConstrId(),
    kind: /** @type {ConstrKind} */ ('intersect'),
    lineIds: [...lineIds],
    els: [pt],
    label: '交点',
  };
  pt._mathConstrId = rec.id;
  host.getConstructions().push(rec);
  host.onChanged?.();
  return rec;
}

/**
 * @param {DrawHost} host
 * @param {string} constrId
 */
export function deleteConstruction(host, constrId) {
  const board = host.getBoard();
  const list = host.getConstructions();
  const rec = list.find((c) => c.id === constrId);
  if (!rec) return false;
  detachConstr(rec, board);
  host.setConstructions(list.filter((c) => c.id !== constrId));
  host.onChanged?.();
  return true;
}

/**
 * 点是否可作为切线锚点：贴在某条函数上
 * @param {any} el
 * @param {DrawHost} host
 */
export function resolveTangentAnchor(el, host) {
  if (!el) return null;
  const fns = host.getFunctions().filter((f) => f.visible && f.curve);
  // glider on curve
  for (const fn of fns) {
    if (el.slideObject === fn.curve || el._mathFollowTargetId === `graph:fn:${fn.id}`) {
      return { pt: el, fn };
    }
  }
  // 用户点带 follow
  if (el._mathFollowTargetId) {
    const id = String(el._mathFollowTargetId).replace(/^graph:fn:/, '').replace(/^graph:/, '');
    const fn =
      fns.find((f) => f.id === id) ||
      fns.find((f) => `graph:fn:${f.id}` === el._mathFollowTargetId);
    if (fn) return { pt: el, fn };
  }
  // 点靠近某条曲线
  try {
    const x = Number(el.X());
    const y = Number(el.Y());
    let best = null;
    let bestD = Infinity;
    for (const fn of fns) {
      const yy = host.evalFnY(fn, x);
      if (yy == null) continue;
      const d = Math.abs(yy - y);
      if (d < bestD) {
        bestD = d;
        best = fn;
      }
    }
    if (best && bestD < 0.35) return { pt: el, fn: best };
  } catch {
    /* */
  }
  return null;
}

/**
 * @param {any} el
 */
export function isDrawableConstrEl(el) {
  return Boolean(el?._mathConstr || el?._mathConstrId);
}

/**
 * @param {any} el
 */
export function isCurveEl(el) {
  const t = el?.elType;
  return (
    t === 'curve' ||
    t === 'functiongraph' ||
    el?.type === 4 /* JSXGraph curve */
  );
}

/**
 * @param {any} el
 */
export function isLineLike(el) {
  const t = el?.elType;
  return t === 'line' || t === 'segment' || Boolean(el?._mathConstrKind === 'line' || el?._mathConstrKind === 'segment' || el?._mathConstrKind === 'tangent');
}
