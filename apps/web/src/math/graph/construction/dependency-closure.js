/** 构造记录之间的引用闭包；用于安全地按“下游优先”顺序拆除对象。 */

/**
 * 判断构造是否引用目标对象（构造 id / 点 id / 函数 id）。
 * 同时支持 legacy runtime 记录（targetConstrId/lineIds）与文档记录（fnId/fnIds/pointIds）。
 * @param {any} construction @param {string} constructionId
 */
function referencesConstruction(construction, constructionId) {
  return (
    construction?.targetConstrId === constructionId ||
    construction?.lineIds?.includes(constructionId) ||
    construction?.pointIds?.includes(constructionId) ||
    construction?.fnId === constructionId ||
    construction?.fnIds?.includes(constructionId)
  );
}

/**
 * @param {any[]} constructions
 * @param {string[]} rootIds
 * @returns {string[]}
 */
export function constructionRemovalOrder(constructions, rootIds) {
  const list = Array.isArray(constructions) ? constructions : [];
  const byId = new Map(list.map((construction) => [construction.id, construction]));
  const visiting = new Set();
  const emitted = new Set();
  const ordered = [];

  const visit = (constructionId) => {
    if (!byId.has(constructionId) || emitted.has(constructionId)) return;
    if (visiting.has(constructionId)) return;
    visiting.add(constructionId);
    for (const candidate of list) {
      if (referencesConstruction(candidate, constructionId)) visit(candidate.id);
    }
    visiting.delete(constructionId);
    emitted.add(constructionId);
    ordered.push(constructionId);
  };

  for (const constructionId of rootIds || []) visit(constructionId);
  return ordered;
}

/**
 * 依赖指定目标（点 / 函数 / 构造）的全部构造 id，下游优先。
 * 目标本身不需要是构造记录（如点、函数 id）；直接引用先被发现，再按闭包排序。
 * @param {any[]} constructions
 * @param {string} targetId
 * @returns {string[]}
 */
export function constructionsDependingOn(constructions, targetId) {
  const list = Array.isArray(constructions) ? constructions : [];
  const directIds = list
    .filter((construction) => referencesConstruction(construction, targetId))
    .map((construction) => construction.id);
  return constructionRemovalOrder(list, directIds);
}

