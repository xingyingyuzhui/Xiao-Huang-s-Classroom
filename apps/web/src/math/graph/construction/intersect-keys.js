/**
 * 交点唯一键索引，避免 autoIntersect 反复全表扫描。
 */

/**
 * @param {any} construction
 * @returns {string | null}
 */
export function intersectRecordKey(construction) {
  if (!construction || construction.kind !== 'intersect') return null;
  const lineIds = Array.isArray(construction.lineIds) ? construction.lineIds.filter(Boolean) : [];
  const fnIds = Array.isArray(construction.fnIds) ? construction.fnIds.filter(Boolean) : [];
  if (lineIds.length === 2 && !fnIds.length) {
    const [a, b] = [...lineIds].sort();
    return `ll:${a}|${b}`;
  }
  if (lineIds.length === 1 && fnIds.length === 1) {
    const index = Number.isInteger(construction.intersectIndex) ? construction.intersectIndex : 0;
    return `lf:${lineIds[0]}|${fnIds[0]}|${index}`;
  }
  if (fnIds.length === 2 && !lineIds.length) {
    const [a, b] = [...fnIds].sort();
    return `ff:${a}|${b}`;
  }
  return null;
}

/** @param {string} idA @param {string} idB */
export function lineLineIntersectKey(idA, idB) {
  const [a, b] = [idA, idB].sort();
  return `ll:${a}|${b}`;
}

/** @param {string} lineId @param {string} fnId @param {number} index */
export function lineFnIntersectKey(lineId, fnId, index) {
  return `lf:${lineId}|${fnId}|${index}`;
}

/**
 * @param {any} host
 * @returns {Map<string, any>}
 */
export function buildIntersectKeyIndex(host) {
  /** @type {Map<string, any>} */
  const map = new Map();
  for (const construction of host.getConstructions() || []) {
    const key = intersectRecordKey(construction);
    if (key) map.set(key, construction);
  }
  return map;
}
