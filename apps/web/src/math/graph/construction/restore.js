/** 作图记录的重建入口。 */

import { clearAllConstructions, isLineLike, lineLikeElOf, supportingLineElOf } from './records.js';
import { createLineIntersection, createLineFnIntersection } from './intersections.js';
import { createSegmentOrLine, createTangent } from './render-lines.js';
import {
  createNormalAtFn,
  createPerpFootToFn,
  createPerpToAxis,
  createPerpToLine,
} from './render-perpendiculars.js';

/**
 * @param {any} host
 * @param {any[]} saved
 * @param {{ notify?: boolean }} [options]
 */
export function restoreConstructions(host, saved, options = {}) {
  clearAllConstructions(host);
  for (const meta of saved || []) {
    try {
      recreateConstr(host, meta);
    } catch (err) {
      console.warn('[graph-draw] restore failed', meta?.kind, err);
    }
  }
  if (options.notify !== false) host.onChanged?.();
}

/** @param {any} host @param {any} meta */
function recreateConstr(host, meta) {
  if (!meta?.kind) return null;
  const skipAuto = { skipAutoIntersect: true, notify: false };
  if (meta.kind === 'segment' || meta.kind === 'line') {
    const a = host.findUserEl(meta.pointIds?.[0] || '');
    const b = host.findUserEl(meta.pointIds?.[1] || '');
    if (!a || !b) return null;
    return createSegmentOrLine(host, meta.kind, a, b, meta.pointIds, meta.id, {
      skipAutoIntersect: true,
      extend: meta.extend,
    });
  }
  if (meta.kind === 'tangent') {
    const pt = host.findUserEl(meta.pointIds?.[0] || '');
    const fn = host.getFunctions().find((f) => f.id === meta.fnId);
    if (!pt || !fn?.curve) return null;
    return createTangent(host, pt, fn, meta.pointIds?.[0], meta.id, skipAuto);
  }
  if (meta.kind === 'perp') {
    const pt = host.findUserEl(meta.pointIds?.[0] || '');
    if (!pt) return null;
    const opts = { skipAutoIntersect: true, notify: false, extend: meta.extend };
    if (meta.perpTarget === 'line' && meta.targetConstrId) {
      const lineEl = host.findConstr(meta.targetConstrId)?.els?.find(isLineLike);
      return lineEl
        ? createPerpToLine(host, pt, lineEl, meta.pointIds?.[0], meta.targetConstrId, meta.id, opts)
        : null;
    }
    const fn = host.getFunctions().find((f) => f.id === meta.fnId);
    if (meta.perpTarget === 'normal') return fn?.curve ? createNormalAtFn(host, pt, fn, meta.pointIds?.[0], meta.id, skipAuto) : null;
    if (meta.perpTarget === 'curve') return fn?.curve ? createPerpFootToFn(host, pt, fn, meta.pointIds?.[0], meta.id, opts) : null;
    return meta.axis === 'x' || meta.axis === 'y'
      ? createPerpToAxis(host, pt, meta.axis, meta.pointIds?.[0], meta.id, opts)
      : null;
  }
  if (meta.kind !== 'intersect') return null;
  if (meta.fnIds?.length === 2 && !meta.lineIds?.length) {
    const rec = { id: meta.id || host.nextConstrId(), kind: 'intersect', fnIds: [meta.fnIds[0], meta.fnIds[1]], pointIds: meta.pointIds ? [...meta.pointIds] : [], els: [], label: '交点' };
    host.getConstructions().push(rec);
    return rec;
  }
  if (meta.lineIds?.length === 2) {
    const lineA = supportingLineElOf(host.findConstr(meta.lineIds[0])) || lineLikeElOf(host.findConstr(meta.lineIds[0]));
    const lineB = supportingLineElOf(host.findConstr(meta.lineIds[1])) || lineLikeElOf(host.findConstr(meta.lineIds[1]));
    return lineA && lineB
      ? createLineIntersection(host, lineA, lineB, meta.lineIds, meta.id, { notify: false })
      : null;
  }
  if (meta.lineIds?.length === 1 && meta.fnIds?.length === 1) {
    const lineEl = lineLikeElOf(host.findConstr(meta.lineIds[0])) || supportingLineElOf(host.findConstr(meta.lineIds[0]));
    const fn = host.getFunctions().find((f) => f.id === meta.fnIds[0]);
    return lineEl && fn?.curve
      ? createLineFnIntersection(host, lineEl, fn, meta.lineIds[0], meta.fnIds[0], meta.intersectIndex ?? 0, meta.id, { notify: false })
      : null;
  }
  return null;
}
