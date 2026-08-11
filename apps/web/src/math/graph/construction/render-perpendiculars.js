/** 轴、直线与函数垂线的 JSXGraph 渲染工厂。 */
import {
  attachMidpointMeasureLabel,
  bindLiveLabel,
  boardLabelAttrs,
  formatElementCoordsLabel,
  formatSmartNumber,
  measureLabelPlacementFor,
} from '../../shared/board-label.js';
import { getMathBoardChrome } from '../../shared/math-theme.js';
import { autoIntersectNewLine } from './intersections.js';
import { findPerpFootOnFn, normalDirectionFromSlope } from './geometry.js';
import { segmentLengthText, formatLineMeasureLabel } from './measurements.js';
import { applyFootPointLabel, createExtendRay } from './primitives.js';

/** @param {any} host @param {any} pt @param {'x'|'y'} axis @param {string} pointId @param {string} [id] @param {{ skipAutoIntersect?: boolean, extend?: boolean, notify?: boolean }} [opts] */
export function createPerpToAxis(host, pt, axis, pointId, id, opts = {}) {
  const board = host.getBoard();
  if (!board || !pt) return null;
  const chrome = getMathBoardChrome();
  const offset = axis === 'x' ? [0, 22] : [22, 0];
  const foot = board.create('point', axis === 'x'
    ? [() => pt.X(), () => 0]
    : [() => 0, () => pt.Y()], {
    name: 'H', size: 3, fillColor: chrome.diagram, strokeColor: chrome.pointRing,
    withLabel: true, fixed: true,
    label: boardLabelAttrs({ strokeColor: chrome.ink, color: chrome.ink, autoPosition: false, offset }),
  });
  Object.assign(foot, {
    _mathConstr: true, _mathConstrKind: 'perp', _mathCanFollow: false,
    _mathUserPoint: false, _mathBaseName: 'H', _mathShowCoords: true,
  });
  applyFootPointLabel(foot, () => formatElementCoordsLabel(foot, 'H'), chrome.ink, offset, [pt]);
  const rec = {
    id: id || host.nextConstrId(), kind: 'perp', perpTarget: 'axis', pointIds: [pointId], axis,
    els: [], label: axis === 'x' ? '垂线→x' : '垂线→y', extend: Boolean(opts.extend),
  };
  rec.els.push(createExtendRay(board, pt, foot, rec, chrome.diagram));
  const seg = board.create('segment', [pt, foot], {
    strokeColor: chrome.diagram, strokeWidth: 1.6, dash: 2, fixed: true, withLabel: false, name: '垂线',
  });
  seg._mathConstr = true;
  seg._mathConstrKind = 'perp';
  seg._mathBaseName = rec.label;
  const getText = () =>
    formatLineMeasureLabel(seg, `${axis === 'x' ? '⊥x' : '⊥y'} · ${segmentLengthText(pt, foot)}`);
  const measure = attachMidpointMeasureLabel(board, seg, pt, foot, getText, {
    color: chrome.ink, placement: measureLabelPlacementFor('perp'),
  });
  if (measure) {
    measure._mathConstr = true;
    bindLiveLabel(measure, getText, [pt, foot]);
  }
  for (const el of [foot, seg, measure].filter(Boolean)) el._mathConstrId = rec.id;
  rec.els.push(foot, seg);
  if (measure) rec.els.push(measure);
  host.getConstructions().push(rec);
  if (!opts.skipAutoIntersect) autoIntersectNewLine(host, rec);
  if (opts.notify !== false) host.onChanged?.();
  return rec;
}

/** @param {any} host @param {any} pt @param {any} lineEl @param {string} pointId @param {string} targetConstrId @param {string} [id] @param {{ skipAutoIntersect?: boolean, extend?: boolean, notify?: boolean }} [opts] */
export function createPerpToLine(host, pt, lineEl, pointId, targetConstrId, id, opts = {}) {
  const board = host.getBoard();
  if (!board || !pt || !lineEl) return null;
  const chrome = getMathBoardChrome();
  const offset = [14, 18];
  const foot = board.create('perpendicularpoint', [pt, lineEl], {
    name: 'H', size: 3, fillColor: chrome.diagram, strokeColor: chrome.pointRing,
    withLabel: true, fixed: true,
    label: boardLabelAttrs({ strokeColor: chrome.ink, color: chrome.ink, autoPosition: false, offset }),
  });
  Object.assign(foot, {
    _mathConstr: true, _mathConstrKind: 'perp', _mathCanFollow: false,
    _mathUserPoint: false, _mathBaseName: 'H', _mathShowCoords: true,
  });
  applyFootPointLabel(foot, () => formatElementCoordsLabel(foot, 'H'), chrome.ink, offset, [pt]);
  const rec = {
    id: id || host.nextConstrId(), kind: 'perp', perpTarget: 'line', pointIds: [pointId], targetConstrId,
    els: [], label: '垂线→线', extend: Boolean(opts.extend),
  };
  rec.els.push(createExtendRay(board, pt, foot, rec, chrome.diagram));
  const seg = board.create('segment', [pt, foot], {
    strokeColor: chrome.diagram, strokeWidth: 1.6, dash: 2, fixed: true, withLabel: false, name: '垂线',
  });
  seg._mathConstr = true;
  seg._mathConstrKind = 'perp';
  seg._mathBaseName = rec.label;
  const getText = () => formatLineMeasureLabel(seg, `⊥线 · ${segmentLengthText(pt, foot)}`);
  const measure = attachMidpointMeasureLabel(board, seg, pt, foot, getText, {
    color: chrome.ink, placement: measureLabelPlacementFor('perp'),
  });
  if (measure) {
    measure._mathConstr = true;
    bindLiveLabel(measure, getText, [pt, foot]);
  }
  for (const el of [foot, seg, measure].filter(Boolean)) el._mathConstrId = rec.id;
  rec.els.push(foot, seg);
  if (measure) rec.els.push(measure);
  host.getConstructions().push(rec);
  if (!opts.skipAutoIntersect) autoIntersectNewLine(host, rec);
  if (opts.notify !== false) host.onChanged?.();
  return rec;
}

/** @param {any} pt @param {any} fn @param {any} host */
export function pointOnFn(pt, fn, host) {
  if (!pt || !fn) return false;
  if (pt.slideObject === fn.curve || pt._mathFollowTargetId === `graph:fn:${fn.id}`) return true;
  try {
    const y = host.evalFnY(fn, Number(pt.X()));
    return y != null && Math.abs(y - Number(pt.Y())) < 0.08;
  } catch {
    return false;
  }
}

/** @param {any} host @param {any} pt @param {any} fn @param {string} pointId @param {string} [id] @param {{ skipAutoIntersect?: boolean, notify?: boolean }} [opts] */
export function createPerpToFn(host, pt, fn, pointId, id, opts = {}) {
  return pointOnFn(pt, fn, host)
    ? createNormalAtFn(host, pt, fn, pointId, id, opts)
    : createPerpFootToFn(host, pt, fn, pointId, id, opts);
}

/** @param {any} host @param {any} pt @param {any} fn @param {string} pointId @param {string} [id] @param {{ skipAutoIntersect?: boolean, extend?: boolean, notify?: boolean }} [opts] */
export function createPerpFootToFn(host, pt, fn, pointId, id, opts = {}) {
  const board = host.getBoard();
  if (!board || !pt || !fn?.curve) return null;
  const chrome = getMathBoardChrome();
  const offset = [14, 18];
  const foot = board.create('point', [
    () => findPerpFootOnFn(host, fn, Number(pt.X()), Number(pt.Y()))?.x ?? Number(pt.X()),
    () => findPerpFootOnFn(host, fn, Number(pt.X()), Number(pt.Y()))?.y ?? Number(pt.Y()),
  ], { name: 'H', size: 3, fillColor: chrome.diagram, strokeColor: chrome.pointRing, withLabel: true, fixed: true,
    label: boardLabelAttrs({ strokeColor: chrome.ink, color: chrome.ink, autoPosition: false, offset }) });
  Object.assign(foot, { _mathConstr: true, _mathConstrKind: 'perp', _mathCanFollow: false, _mathUserPoint: false, _mathBaseName: 'H', _mathShowCoords: true });
  applyFootPointLabel(foot, () => formatElementCoordsLabel(foot, 'H'), chrome.ink, offset, [pt]);
  const rec = { id: id || host.nextConstrId(), kind: 'perp', perpTarget: 'curve', pointIds: [pointId], fnId: fn.id, els: [], label: '垂线→曲线', extend: Boolean(opts.extend) };
  rec.els.push(createExtendRay(board, pt, foot, rec, chrome.diagram));
  const seg = board.create('segment', [pt, foot], {
    strokeColor: chrome.diagram, strokeWidth: 1.6, dash: 2, fixed: true, withLabel: false, name: '垂线',
  });
  seg._mathConstr = true;
  seg._mathConstrKind = 'perp';
  seg._mathBaseName = rec.label;
  const getText = () => formatLineMeasureLabel(seg, `⊥曲线 · ${segmentLengthText(pt, foot)}`);
  const measure = attachMidpointMeasureLabel(board, seg, pt, foot, getText, {
    color: chrome.ink,
    placement: measureLabelPlacementFor('perp'),
  });
  if (measure) {
    measure._mathConstr = true;
    bindLiveLabel(measure, getText, [pt, foot]);
  }
  for (const el of [foot, seg, measure].filter(Boolean)) el._mathConstrId = rec.id;
  rec.els.push(foot, seg);
  if (measure) rec.els.push(measure);
  host.getConstructions().push(rec);
  if (!opts.skipAutoIntersect) autoIntersectNewLine(host, rec);
  if (opts.notify !== false) host.onChanged?.();
  return rec;
}

/**
 * 创建函数上一点的法线。方向向量 (-k, 1) 与切向量 (1, k) 正交，
 * 也避免了直接计算 -1/k 在水平切线附近产生数值爆炸。
 * @param {any} host
 * @param {any} pt
 * @param {any} fn
 * @param {string} pointId
 * @param {string} [id]
 * @param {{ skipAutoIntersect?: boolean, notify?: boolean }} [opts]
 */
export function createNormalAtFn(host, pt, fn, pointId, id, opts = {}) {
  const board = host.getBoard();
  if (!board || !pt || !fn?.curve) return null;
  const chrome = getMathBoardChrome();

  const slopeAt = (x) => {
    const h = 1e-4;
    const yBefore = host.evalFnY(fn, x - h);
    const yAfter = host.evalFnY(fn, x + h);
    if (yBefore == null || yAfter == null) return 0;
    return (yAfter - yBefore) / (2 * h);
  };
  const directionAt = (x) => normalDirectionFromSlope(slopeAt(x));

  const anchor = board.create(
    'point',
    [() => Number(pt.X()), () => Number(pt.Y())],
    { visible: false, withLabel: false, fixed: true },
  );
  const directionPoint = board.create(
    'point',
    [
      () => Number(pt.X()) + directionAt(Number(pt.X())).x,
      () => Number(pt.Y()) + directionAt(Number(pt.X())).y,
    ],
    { visible: false, withLabel: false, fixed: true },
  );
  const line = board.create('line', [anchor, directionPoint], {
    strokeColor: chrome.diagram,
    strokeWidth: 2,
    fixed: true,
    withLabel: false,
    name: '法线',
  });
  line._mathConstr = true;
  line._mathConstrKind = 'perp';
  anchor._mathConstr = true;
  directionPoint._mathConstr = true;

  const rec = {
    id: id || host.nextConstrId(),
    kind: 'perp',
    perpTarget: 'normal',
    pointIds: [pointId],
    fnId: fn.id,
    els: [],
    label: '法线',
  };
  line._mathBaseName = rec.label;

  const getText = () => {
    const tangentSlope = slopeAt(Number(pt.X()));
    let measure = '';
    if (!Number.isFinite(tangentSlope)) measure = '';
    else if (Math.abs(tangentSlope) < 1e-9) measure = '竖直线';
    else if (Math.abs(tangentSlope) > 1e6) measure = '水平线';
    else measure = `k=${formatSmartNumber(-1 / tangentSlope)}`;
    return formatLineMeasureLabel(line, measure);
  };
  const measure = attachMidpointMeasureLabel(
    board,
    line,
    anchor,
    directionPoint,
    getText,
    {
      color: chrome.ink,
      placement: measureLabelPlacementFor('tangent'),
    },
  );
  if (measure) {
    measure._mathConstr = true;
    bindLiveLabel(measure, getText, [pt]);
  }

  rec.els = measure
    ? [anchor, directionPoint, line, measure]
    : [anchor, directionPoint, line];
  for (const el of rec.els) el._mathConstrId = rec.id;
  host.getConstructions().push(rec);
  if (!opts.skipAutoIntersect) autoIntersectNewLine(host, rec);
  if (opts.notify !== false) host.onChanged?.();
  return rec;
}
