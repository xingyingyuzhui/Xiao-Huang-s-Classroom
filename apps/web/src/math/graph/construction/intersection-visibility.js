/** 交点在有限线段、延长线与视口之间的显隐规则。 */

import { pointInViewport, readViewportBounds } from '../../shared/viewport-bounds.js';
import { pointLiesOnConstr } from './records.js';

/** @param {any} host @param {string[] | undefined} lineIds @param {number} x @param {number} y */
export function intersectLiesOnAllLines(host, lineIds, x, y) {
  if (!lineIds?.length) return false;
  return lineIds.every((id) => pointLiesOnConstr(host.findConstr(id), x, y));
}

/**
 * 视口只控制 runtime 显隐，不决定 construction 存在性。
 *
 * geometryExists && onBody && inViewport → visible
 * `_mathIntersectOnBody` 与 `_mathIntersectInViewport` 分开记录。
 *
 * @param {any} host
 * @param {any} pt
 * @param {string[]} lineIds
 */
export function syncIntersectVisibility(host, pt, lineIds) {
  if (!pt) return false;

  let geometryExists = false;
  let onBody = false;
  let x = NaN;
  let y = NaN;

  try {
    if (typeof pt._mathIntersectComputeRaw === 'function') {
      const hit = pt._mathIntersectComputeRaw();
      if (hit && Number.isFinite(hit.x) && Number.isFinite(hit.y)) {
        x = hit.x;
        y = hit.y;
        geometryExists = true;
        // computeRaw 已含线体约束；命中即在有效几何上
        onBody = true;
      }
    } else {
      x = Number(pt.X());
      y = Number(pt.Y());
      geometryExists = Number.isFinite(x) && Number.isFinite(y);
      onBody =
        geometryExists && intersectLiesOnAllLines(host, lineIds, x, y);
    }
  } catch {
    geometryExists = false;
    onBody = false;
  }

  const bounds = readViewportBounds(host.getBoard?.() || pt.board);
  const inViewport =
    geometryExists && bounds ? pointInViewport(x, y, bounds) : geometryExists;

  const visible = Boolean(geometryExists && onBody && inViewport);

  try {
    pt.setAttribute({ visible });
  } catch {
    /* partially disposed points cannot be restyled */
  }
  try {
    if (!pt._mathLabelHiddenForDrag && !pt._mathLabelFusionSuppressed) {
      pt.label?.setAttribute?.({ visible });
    } else if (!visible) {
      pt.label?.setAttribute?.({ visible: false });
    }
  } catch {
    /* label is optional */
  }

  pt._mathIntersectOnBody = onBody;
  pt._mathIntersectInViewport = inViewport;
  return visible;
}
