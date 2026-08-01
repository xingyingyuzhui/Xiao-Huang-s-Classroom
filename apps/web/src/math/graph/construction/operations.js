/** 作图对象删除与交互锚点解析。 */

import { parseFeatureFollowTargetId } from '../../shared/follow-target.js';
import { detachConstr } from './records.js';
import { constructionRemovalOrder } from './dependency-closure.js';

/** @param {any} host @param {string} constrId */
export function deleteConstruction(host, constrId) {
  const board = host.getBoard();
  const list = host.getConstructions();
  const ids = constructionRemovalOrder(list, [constrId]);
  if (!ids.length) return false;
  const doomed = new Set(ids);
  const byId = new Map(list.map((construction) => [construction.id, construction]));
  for (const id of ids) detachConstr(byId.get(id), board);
  host.setConstructions(list.filter((construction) => !doomed.has(construction.id)));
  host.onChanged?.();
  return true;
}

/** @param {any} el @param {any} host */
export function resolveTangentAnchor(el, host) {
  if (!el) return null;
  const fns = host.getFunctions().filter((fn) => fn.visible && fn.curve);
  for (const fn of fns) {
    if (el.slideObject === fn.curve || el._mathFollowTargetId === `graph:fn:${fn.id}`) {
      return { pt: el, fn };
    }
    const feature = parseFeatureFollowTargetId(el._mathFollowTargetId);
    if (feature && feature.fnId === fn.id) return { pt: el, fn };
  }
  if (el._mathFollowTargetId) {
    const feature = parseFeatureFollowTargetId(el._mathFollowTargetId);
    if (feature) {
      const fn = fns.find((item) => item.id === feature.fnId);
      if (fn) return { pt: el, fn };
    }
    const id = String(el._mathFollowTargetId).replace(/^graph:fn:/, '').replace(/^graph:/, '');
    const fn =
      fns.find((item) => item.id === id) ||
      fns.find((item) => `graph:fn:${item.id}` === el._mathFollowTargetId);
    if (fn) return { pt: el, fn };
  }
  try {
    const x = Number(el.X());
    const y = Number(el.Y());
    let best = null;
    let bestD = Infinity;
    for (const fn of fns) {
      const yy = host.evalFnY(fn, x);
      if (yy == null) continue;
      const distance = Math.abs(yy - y);
      if (distance < bestD) {
        bestD = distance;
        best = fn;
      }
    }
    if (best && bestD < 0.35) return { pt: el, fn: best };
  } catch {
    /* invalid JSXGraph point */
  }
  return null;
}
