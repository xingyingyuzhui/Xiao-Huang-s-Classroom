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
  buildIntersectKeyIndex,
  lineFnIntersectKey,
  lineLineIntersectKey,
} from './intersect-keys.js';
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

/** 线×函数自动尝试的最大交点索引（含 0）；保持 0…7 数学完整性 */
const MAX_LINE_FN_INDEX = 7;

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

/**
 * @param {any} board
 * @param {() => void} work
 */
function withSuspendedBoard(board, work) {
  const canSuspend = typeof board?.suspendUpdate === 'function';
  const canUnsuspend = typeof board?.unsuspendUpdate === 'function';
  if (canSuspend) {
    try {
      board.suspendUpdate();
    } catch {
      /* */
    }
  }
  try {
    work();
  } finally {
    if (canUnsuspend) {
      try {
        board.unsuspendUpdate();
      } catch {
        /* */
      }
    } else if (canSuspend) {
      try {
        board.update?.();
      } catch {
        /* */
      }
    }
  }
}

/** @param {any} host @param {any} newConstruction */
export function autoIntersectNewLine(host, newConstruction) {
  if (!newConstruction) return;
  const board = host.getBoard?.();
  const supportLine =
    supportingLineElOf(newConstruction) || lineLikeElOf(newConstruction);
  if (!supportLine) return;
  const visibleLine = lineLikeElOf(newConstruction) || supportLine;
  const index = buildIntersectKeyIndex(host);

  const run = () => {
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
      const key = lineLineIntersectKey(newConstruction.id, construction.id);
      if (!otherLine || otherLine === supportLine || index.has(key)) {
        continue;
      }
      try {
        const made = createLineIntersection(
          host,
          supportLine,
          otherLine,
          [newConstruction.id, construction.id].sort(),
          undefined,
          { notify: false },
        );
        if (made) index.set(key, made);
      } catch {
        /* parallel or temporarily invalid JSXGraph objects have no intersection */
      }
    }

    const visibleFunctions = host.getFunctions().filter((fn) => fn.visible && fn.curve);
    for (const fn of visibleFunctions) {
      for (let i = 0; i <= MAX_LINE_FN_INDEX; i += 1) {
        const key = lineFnIntersectKey(newConstruction.id, fn.id, i);
        if (index.has(key)) continue;
        const made = createLineFnIntersection(
          host,
          visibleLine,
          fn,
          newConstruction.id,
          fn.id,
          i,
          undefined,
          { notify: false },
        );
        if (made) index.set(key, made);
      }
    }
  };

  if (board) withSuspendedBoard(board, run);
  else run();
}
