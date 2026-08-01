/** 交点在有限线段与延长支撑线之间的显隐规则。 */

import { pointLiesOnConstr } from './records.js';

/** @param {any} host @param {string[] | undefined} lineIds @param {number} x @param {number} y */
export function intersectLiesOnAllLines(host, lineIds, x, y) {
  if (!lineIds?.length) return false;
  return lineIds.every((id) => pointLiesOnConstr(host.findConstr(id), x, y));
}

/**
 * JSXGraph 交点沿支撑直线滑动；有限对象未开启延长时，不显示线体外的交点。
 * @param {any} host
 * @param {any} pt
 * @param {string[]} lineIds
 */
export function syncIntersectVisibility(host, pt, lineIds) {
  if (!pt) return false;
  let visible = false;
  try {
    if (typeof pt._mathIntersectComputeRaw === 'function') {
      visible = Boolean(pt._mathIntersectComputeRaw());
    } else {
      const x = Number(pt.X());
      const y = Number(pt.Y());
      visible = Number.isFinite(x) && Number.isFinite(y) && intersectLiesOnAllLines(host, lineIds, x, y);
    }
  } catch {
    visible = false;
  }
  try {
    pt.setAttribute({ visible });
  } catch {
    /* partially disposed points cannot be restyled */
  }
  try {
    pt.label?.setAttribute?.({ visible });
  } catch {
    /* label is optional */
  }
  pt._mathIntersectOnBody = visible;
  return visible;
}
