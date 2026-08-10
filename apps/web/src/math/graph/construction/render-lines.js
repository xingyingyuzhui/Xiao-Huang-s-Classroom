/** 线段、直线与切线的 JSXGraph 渲染工厂。 */
import {
  attachMidpointMeasureLabel,
  bindLiveLabel,
  boardLabelAttrs,
  formatSmartNumber,
  measureLabelPlacementFor,
} from '../../shared/board-label.js';
import { getMathBoardChrome } from '../../shared/math-theme.js';
import { autoIntersectNewLine } from './intersections.js';
import { createExtendRay } from './primitives.js';
import { lineSlopeText, segmentLengthText } from './measurements.js';

/**
 * @param {any} host
 * @param {'segment'|'line'} kind
 * @param {any} p1
 * @param {any} p2
 * @param {string[]} pointIds
 * @param {string} [id]
 * @param {{ skipAutoIntersect?: boolean, extend?: boolean, notify?: boolean }} [opts]
 */
export function createSegmentOrLine(host, kind, p1, p2, pointIds, id, opts = {}) {
  const board = host.getBoard();
  if (!board || !p1 || !p2) return null;
  const chrome = getMathBoardChrome();
  const getText = kind === 'segment'
    ? () => segmentLengthText(p1, p2)
    : () => lineSlopeText(p1, p2);
  const rec = {
    id: id || host.nextConstrId(),
    kind,
    pointIds: [...pointIds],
    els: [],
    label: kind === 'segment' ? '线段' : '直线',
    extend: kind === 'segment' ? Boolean(opts.extend) : false,
  };
  if (kind === 'segment') rec.els.push(createExtendRay(board, p1, p2, rec, chrome.stamp));
  const el = board.create(kind === 'segment' ? 'segment' : 'line', [p1, p2], {
    strokeColor: chrome.stamp,
    strokeWidth: 2,
    straightFirst: kind === 'line',
    straightLast: kind === 'line',
    fixed: true,
    withLabel: false,
    name: rec.label,
  });
  el._mathConstr = true;
  el._mathConstrKind = kind;
  el._mathConstrId = rec.id;
  rec.els.push(el);
  const measure = attachMidpointMeasureLabel(board, el, p1, p2, getText, {
    color: chrome.ink,
    placement: measureLabelPlacementFor(kind),
  });
  if (measure) {
    measure._mathConstr = true;
    measure._mathConstrId = rec.id;
    bindLiveLabel(measure, getText, [p1, p2]);
    rec.els.push(measure);
  }
  host.getConstructions().push(rec);
  if (!opts.skipAutoIntersect) autoIntersectNewLine(host, rec);
  if (opts.notify !== false) host.onChanged?.();
  return rec;
}

/** @param {any} host @param {any} pt @param {any} fn @param {string} pointId @param {string} [id] @param {{ skipAutoIntersect?: boolean, notify?: boolean }} [opts] */
export function createTangent(host, pt, fn, pointId, id, opts = {}) {
  const board = host.getBoard();
  if (!board || !pt || !fn?.curve) return null;
  const chrome = getMathBoardChrome();
  const slopeAt = (x) => {
    const h = 1e-4;
    const ya = host.evalFnY(fn, x - h);
    const yb = host.evalFnY(fn, x + h);
    return ya == null || yb == null ? 0 : (yb - ya) / (2 * h);
  };
  const yAt = (x) => host.evalFnY(fn, x) ?? Number(pt.Y());
  const pA = board.create('point', [() => Number(pt.X()), () => yAt(Number(pt.X()))], {
    visible: false, withLabel: false, fixed: true,
  });
  const pB = board.create('point', [
    () => Number(pt.X()) + 1,
    () => yAt(Number(pt.X())) + slopeAt(Number(pt.X())),
  ], { visible: false, withLabel: false, fixed: true });
  const line = board.create('line', [pA, pB], {
    strokeColor: chrome.diagram, strokeWidth: 2.2, fixed: true, withLabel: false, name: '切线',
  });
  line._mathConstr = true;
  line._mathConstrKind = 'tangent';
  pA._mathConstr = true;
  pB._mathConstr = true;
  const getText = () => {
    const slope = slopeAt(Number(pt.X()));
    return Number.isFinite(slope) ? `切线 · k=${formatSmartNumber(slope)}` : '切线';
  };
  const measure = attachMidpointMeasureLabel(board, line, pA, pB, getText, {
    color: chrome.ink, placement: measureLabelPlacementFor('tangent'),
  });
  if (measure) {
    measure._mathConstr = true;
    bindLiveLabel(measure, getText, [pt]);
  }
  const rec = {
    id: id || host.nextConstrId(), kind: 'tangent', pointIds: [pointId], fnId: fn.id,
    els: measure ? [pA, pB, line, measure] : [pA, pB, line], label: '切线',
  };
  for (const el of rec.els) el._mathConstrId = rec.id;
  host.getConstructions().push(rec);
  if (!opts.skipAutoIntersect) autoIntersectNewLine(host, rec);
  if (opts.notify !== false) host.onChanged?.();
  return rec;
}

/**
 * 割线构造：函数上 (x1, f(x1)) 与 (x2, f(x2)) 的连线 + A/B 端点 + 中点量测标签。
 * 端点用函数上的 glider（拖动更新 x1/x2 语义，由调用方 commit）。
 * @param {any} host
 * @param {any} meta { id, kind:'secant', fnId, x1, x2, showDelta }
 * @param {{ notify?: boolean }} [opts]
 */
export function createSecantConstruction(host, meta = {}, opts = {}) {
  const board = host.getBoard();
  const fn = host.getFunctions().find((item) => item.id === meta.fnId);
  if (!board || !fn?.curve) return null;
  // 先校验 board/目标函数、再分配最终 ID：失败尝试不消耗 allocator，
  // 也不得先用可能为空的 meta.id 标记 element
  const id = meta.id || host.nextConstrId();
  const chrome = getMathBoardChrome();

  const x1 = Number.isFinite(Number(meta.x1)) ? Number(meta.x1) : 0;
  const x2 = Number.isFinite(Number(meta.x2)) ? Number(meta.x2) : 1;
  const yAt = (x) => host.evalFnY(fn, x) ?? 0;

  const pA = board.create('glider', [x1, yAt(x1), fn.curve], {
    name: 'A',
    size: 3,
    fillColor: chrome.diagram,
    strokeColor: chrome.pointRing,
    withLabel: true,
    label: boardLabelAttrs({ strokeColor: chrome.ink, color: chrome.ink }),
  });
  const pB = board.create('glider', [x2, yAt(x2), fn.curve], {
    name: 'B',
    size: 3,
    fillColor: chrome.diagram,
    strokeColor: chrome.pointRing,
    withLabel: true,
    label: boardLabelAttrs({ strokeColor: chrome.ink, color: chrome.ink }),
  });

  const seg = board.create('segment', [pA, pB], {
    strokeColor: chrome.diagram,
    strokeWidth: 2,
    dash: 1,
    fixed: true,
    withLabel: false,
    name: '割线',
  });

  const getText = () => {
    const ax = Number(pA.X());
    const bx = Number(pB.X());
    const ay = host.evalFnY(fn, ax);
    const by = host.evalFnY(fn, bx);
    if (ay == null || by == null) return '割线 · 暂停';
    const dx = bx - ax;
    if (Math.abs(dx) < 1e-9) return '割线 · 暂停';
    const dy = by - ay;
    const slope = dy / dx;
    const parts = [`Δx=${formatSmartNumber(dx)}`, `Δy=${formatSmartNumber(dy)}`, `平均变化率=${formatSmartNumber(slope)}`];
    return meta.showDelta === false ? `平均变化率=${formatSmartNumber(slope)}` : parts.join('  ');
  };

  const measure = attachMidpointMeasureLabel(board, seg, pA, pB, getText, {
    color: chrome.ink,
    placement: measureLabelPlacementFor('segment'),
  });

  const els = [pA, pB, seg];
  if (measure) {
    measure._mathConstr = true;
    bindLiveLabel(measure, getText, [pA, pB]);
    els.push(measure);
  }
  // 所有 JSXGraph element 创建完成后统一写最终 id
  for (const el of els) {
    el._mathConstr = true;
    el._mathConstrId = id;
    el._mathConstrKind = 'secant';
  }
  pA._mathSecantX = 'x1';
  pB._mathSecantX = 'x2';
  const rec = {
    id,
    kind: 'secant',
    fnId: fn.id,
    x1: Number(pA.X()),
    x2: Number(pB.X()),
    showDelta: meta.showDelta !== false,
    els,
    label: '割线',
    extend: false,
  };
  host.getConstructions().push(rec);
  if (opts.notify !== false) host.onChanged?.();
  return rec;
}
