/** 用户点与作图记录之间的依赖查询和批量拆除。 */

import { detachConstr } from './records.js';
import { constructionRemovalOrder } from './dependency-closure.js';

/**
 * 返回依赖某用户点的全部构造 ID。下游记录排在上游记录之前，
 * 从而能在 JSXGraph 自动拆除父对象前先解除交点等子对象的监听。
 *
 * @param {any[]} constructions
 * @param {string} pointId
 * @returns {string[]}
 */
export function constructionIdsDependingOnPoint(constructions, pointId) {
  if (!pointId) return [];
  const list = Array.isArray(constructions) ? constructions : [];
  const directIds = list
    .filter((construction) => construction?.pointIds?.includes(pointId))
    .map((construction) => construction.id);
  return constructionRemovalOrder(list, directIds);
}

/**
 * 一次性拆除依赖某点的构造，并只发布一次状态变化。
 * @param {any} host
 * @param {string} pointId
 * @param {{ notify?: boolean }} [options]
 * @returns {string[]}
 */
export function deleteConstructionsDependingOnPoint(host, pointId, options = {}) {
  const constructions = host.getConstructions();
  const ids = constructionIdsDependingOnPoint(constructions, pointId);
  if (!ids.length) return ids;

  const doomed = new Set(ids);
  const byId = new Map(constructions.map((construction) => [construction.id, construction]));
  const board = host.getBoard();
  for (const id of ids) detachConstr(byId.get(id), board);
  host.setConstructions(
    constructions.filter((construction) => !doomed.has(construction.id)),
  );
  if (options.notify !== false) host.onChanged?.();
  return ids;
}
