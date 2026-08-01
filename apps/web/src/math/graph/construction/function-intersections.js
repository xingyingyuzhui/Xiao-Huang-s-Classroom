/** 函数与函数交点的业务记录创建。 */

/**
 * @param {any} host
 * @param {string} firstFunctionId
 * @param {string} secondFunctionId
 * @param {string} [id]
 */
export function createFnIntersection(host, firstFunctionId, secondFunctionId, id) {
  const board = host.getBoard();
  const functions = host.getFunctions();
  const first = functions.find((fn) => fn.id === firstFunctionId);
  const second = functions.find((fn) => fn.id === secondFunctionId);
  if (!board || !first || !second) return null;

  let hit = null;
  const seeds = [-6, -3, -1, 0, 1, 3, 6, -8, 8, -2, 2, 4, -4];
  for (const seed of seeds) {
    hit = host.recomputeIntersection(firstFunctionId, secondFunctionId, seed, 0);
    if (hit) break;
  }
  if (!hit) return null;

  const pointRecord = host.createUserPoint(hit.x, hit.y, {
    intersectFnIds: [firstFunctionId, secondFunctionId],
    showCoords: true,
  });
  if (!pointRecord) return null;

  const construction = {
    id: id || host.nextConstrId(),
    kind: 'intersect',
    fnIds: [firstFunctionId, secondFunctionId],
    pointIds: [pointRecord.id],
    els: [],
    label: '交点',
  };
  host.getConstructions().push(construction);
  host.onChanged?.();
  return construction;
}
