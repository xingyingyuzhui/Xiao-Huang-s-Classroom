/**
 * 作图记录的状态语义与生命周期。
 *
 * 记录只保存关系和 JSXGraph 元素引用；具体元素创建仍由 draw-tools 负责。
 */

import { pointOnSegment } from './geometry.js';
import { clearConstructionDependencies } from './dependencies.js';

/** @param {any} el */
export function isCurveEl(el) {
  const t = el?.elType;
  return t === 'curve' || t === 'functiongraph' || el?.type === 4;
}

/** @param {any} el */
export function isLineLike(el) {
  if (!el || el._mathExtendRay) return false;
  const t = el?.elType;
  if (t === 'point' || t === 'glider' || t === 'perpendicularpoint') return false;
  return (
    t === 'line' ||
    t === 'segment' ||
    Boolean(
      el?._mathConstrKind === 'line' ||
        el?._mathConstrKind === 'segment' ||
        el?._mathConstrKind === 'tangent' ||
        (el?._mathConstrKind === 'perp' && t === 'segment'),
    )
  );
}

/** @param {any} rec */
export function lineLikeElOf(rec) {
  if (!rec?.els?.length) return null;
  const candidates = rec.els.filter((el) => el && !el._mathExtendRay && isLineLike(el));
  return (
    candidates.find((el) => el.elType === 'line') ||
    candidates.find((el) => el.elType === 'segment') ||
    candidates[0] ||
    null
  );
}

/** @param {any} rec */
export function supportingLineElOf(rec) {
  if (!rec?.els?.length) return null;
  return rec.els.find((el) => el && el._mathExtendRay) || lineLikeElOf(rec);
}

/** @param {any} rec */
export function canExtendConstr(rec) {
  if (!rec) return false;
  return rec.kind === 'segment' || (rec.kind === 'perp' && rec.perpTarget !== 'normal');
}

/** @param {any} rec */
export function constrIsInfinite(rec) {
  if (!rec) return true;
  if (rec.kind === 'line' || rec.kind === 'tangent') return true;
  if (rec.kind === 'perp' && rec.perpTarget === 'normal') return true;
  return Boolean(rec.extend);
}

/**
 * @param {any} rec
 * @param {number} x
 * @param {number} y
 */
export function pointLiesOnConstr(rec, x, y) {
  if (!rec) return false;
  if (constrIsInfinite(rec)) return true;
  const el = lineLikeElOf(rec);
  return el?.elType === 'segment' ? pointOnSegment(el, x, y) : false;
}

/** @param {any} el @param {any} rec */
export function isExtendStyleTarget(el, rec) {
  return Boolean(el && !el._mathExtendRay && el.elType === 'segment' && canExtendConstr(rec));
}

/** @param {any} el */
export function isDrawableConstrEl(el) {
  return Boolean(el?._mathConstr || el?._mathConstrId);
}

/**
 * @param {any} rec
 * @param {any} board
 */
export function detachConstr(rec, board) {
  if (!rec) return;
  clearConstructionDependencies(rec);
  for (const el of rec.els || []) {
    try {
      board?.removeObject?.(el);
    } catch {
      /* a partially disposed board must not block the remaining teardown */
    }
  }
  rec.els = [];
}

/** @param {{ getBoard: () => any, getConstructions: () => any[], setConstructions: (list: any[]) => void }} host */
export function clearAllConstructions(host) {
  const board = host.getBoard();
  for (const rec of host.getConstructions().slice()) detachConstr(rec, board);
  host.setConstructions([]);
}

/** @param {any} rec */
export function snapshotConstructionMeta(rec) {
  return {
    id: rec.id,
    kind: rec.kind,
    pointIds: rec.pointIds ? [...rec.pointIds] : undefined,
    fnId: rec.fnId ?? null,
    axis: rec.axis,
    perpTarget: rec.perpTarget,
    targetConstrId: rec.targetConstrId,
    fnIds: rec.fnIds ? [...rec.fnIds] : undefined,
    lineIds: rec.lineIds ? [...rec.lineIds] : undefined,
    intersectIndex: rec.intersectIndex,
    label: rec.label,
    extend: Boolean(rec.extend),
  };
}

/** @param {{ getConstructions: () => any[] }} host */
export function snapshotConstructions(host) {
  return host.getConstructions().map(snapshotConstructionMeta);
}
