/** 构造记录之间的引用闭包；用于安全地按“下游优先”顺序拆除对象。 */

/** @param {any} construction @param {string} constructionId */
function referencesConstruction(construction, constructionId) {
  return (
    construction?.targetConstrId === constructionId ||
    construction?.lineIds?.includes(constructionId)
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

