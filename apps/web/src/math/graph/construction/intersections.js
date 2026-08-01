/** 自动交点调度、延长线联动与交点公共导出。 */

import {
  pruneIntersectsNotOnBody,
  refreshIntersectVisibilityFor,
} from './intersection-lifecycle.js';
import {
  createLineFnIntersection,
  createLineIntersection,
} from './intersection-renderers.js';
import {
  canExtendConstr,
  lineLikeElOf,
  supportingLineElOf,
} from './records.js';

export { createFnIntersection } from './function-intersections.js';
export {
  createLineFnIntersection,
  createLineIntersection,
} from './intersection-renderers.js';
export {
  intersectLiesOnAllLines,
  syncIntersectVisibility,
} from './intersection-visibility.js';

/** @param {any} host @param {any} elementOrRecord @param {boolean} enabled */
export function setConstructionExtend(host, elementOrRecord, enabled) {
  const construction =
    elementOrRecord?.kind && Array.isArray(elementOrRecord.els)
      ? elementOrRecord
      : host.findConstr(elementOrRecord?._mathConstrId || elementOrRecord);
  if (!canExtendConstr(construction)) return;

  const next = Boolean(enabled);
  if (Boolean(construction.extend) === next) return;
  construction.extend = next;
  const supportRay = construction.els.find((element) => element?._mathExtendRay);
  try {
    supportRay?.setAttribute?.({ visible: next });
  } catch {
    /* a partially disposed ray must not block state cleanup */
  }

  if (next) {
    autoIntersectNewLine(host, construction);
  } else {
    pruneIntersectsNotOnBody(host, construction);
  }
  refreshIntersectVisibilityFor(host, construction.id);
  host.onChanged?.();
}

/** @param {any} host @param {string} firstId @param {string} secondId */
function hasLineLineIntersection(host, firstId, secondId) {
  const ids = [firstId, secondId].sort();
  return host.getConstructions().some((construction) => {
    if (
      construction.kind !== 'intersect' ||
      construction.lineIds?.length !== 2 ||
      construction.fnIds?.length
    ) {
      return false;
    }
    const existingIds = [...construction.lineIds].sort();
    return existingIds[0] === ids[0] && existingIds[1] === ids[1];
  });
}

/** @param {any} host @param {string} lineId @param {string} functionId @param {number} index */
function hasLineFunctionIntersection(host, lineId, functionId, index) {
  return host.getConstructions().some(
    (construction) =>
      construction.kind === 'intersect' &&
      construction.lineIds?.length === 1 &&
      construction.fnIds?.length === 1 &&
      construction.lineIds[0] === lineId &&
      construction.fnIds[0] === functionId &&
      (construction.intersectIndex ?? 0) === index,
  );
}

/** @param {any} host @param {any} newConstruction */
export function autoIntersectNewLine(host, newConstruction) {
  if (!newConstruction) return;
  const supportLine =
    supportingLineElOf(newConstruction) || lineLikeElOf(newConstruction);
  if (!supportLine) return;
  const visibleLine = lineLikeElOf(newConstruction) || supportLine;

  for (const construction of host.getConstructions().slice()) {
    if (
      !construction ||
      construction.id === newConstruction.id ||
      construction.kind === 'intersect'
    ) {
      continue;
    }
    const otherLine =
      supportingLineElOf(construction) || lineLikeElOf(construction);
    if (
      !otherLine ||
      otherLine === supportLine ||
      hasLineLineIntersection(host, newConstruction.id, construction.id)
    ) {
      continue;
    }
    try {
      createLineIntersection(
        host,
        supportLine,
        otherLine,
        [newConstruction.id, construction.id].sort(),
        undefined,
        { notify: false },
      );
    } catch {
      /* parallel or temporarily invalid JSXGraph objects have no intersection */
    }
  }

  const visibleFunctions = host.getFunctions().filter((fn) => fn.visible && fn.curve);
  for (const fn of visibleFunctions) {
    for (let index = 0; index < 8; index += 1) {
      if (hasLineFunctionIntersection(host, newConstruction.id, fn.id, index)) continue;
      createLineFnIntersection(
        host,
        visibleLine,
        fn,
        newConstruction.id,
        fn.id,
        index,
        undefined,
        { notify: false },
      );
    }
  }
}
