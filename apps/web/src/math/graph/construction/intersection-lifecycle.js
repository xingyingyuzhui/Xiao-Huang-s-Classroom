/** 交点与其支撑对象之间的更新绑定和回收规则。 */

import { ensurePointGeomHook } from '../../shared/board-label.js';
import { bindConstructionDependency } from './dependencies.js';
import { scheduleIntersectUpdate } from './intersect-update.js';
import { syncIntersectVisibility } from './intersection-visibility.js';
import { deleteConstruction } from './operations.js';
import { lineLikeElOf, pointLiesOnConstr } from './records.js';

/** @param {any} host @param {any} construction @param {any} point @param {string[]} lineIds */
export function bindIntersectVisibility(host, construction, point, lineIds) {
  if (!point || !lineIds?.length) return;
  const sync = () => syncIntersectVisibility(host, point, lineIds);
  point._mathIntersectVisTick = sync;
  point._mathIntersectLineIds = [...lineIds];

  if (typeof point._mathIntersectUpdate !== 'function') {
    point._mathIntersectUpdate = () => {
      point._mathIntersectInvalidate?.();
      try {
        sync();
      } catch {
        /* */
      }
      try {
        point._mathLiveLabelTick?.();
      } catch {
        /* */
      }
      try {
        point.board?._mathSchedulePointLabelFusion?.();
      } catch {
        /* */
      }
    };
  }

  for (const id of lineIds) {
    const line = lineLikeElOf(host.findConstr(id));
    for (const endpoint of [line?.point1, line?.point2].filter(Boolean)) {
      if (typeof endpoint.on !== 'function') continue;
      bindConstructionDependency(construction, endpoint, () => scheduleIntersectUpdate(point));
      ensurePointGeomHook(endpoint);
    }
  }
  try {
    if (typeof point.on === 'function' && !point._mathIntersectUpdateBound) {
      point._mathIntersectUpdateBound = true;
      point.on('update', () => scheduleIntersectUpdate(point));
    }
  } catch {
    /* partially disposed points cannot bind updates */
  }
  sync();
}

/** @param {any} host @param {string} constructionId */
export function refreshIntersectVisibilityFor(host, constructionId) {
  for (const construction of host.getConstructions()) {
    if (construction?.kind !== 'intersect' || !construction.lineIds?.includes(constructionId)) {
      continue;
    }
    const point = construction.els?.find(
      (element) => element?.elType === 'point' || element?.elType === 'glider',
    );
    if (!point) continue;
    if (typeof point._mathIntersectUpdate === 'function') {
      scheduleIntersectUpdate(point);
    } else if (typeof point._mathIntersectVisTick === 'function') {
      point._mathIntersectVisTick();
    } else {
      syncIntersectVisibility(host, point, construction.lineIds);
    }
  }
}

/** @param {any} host @param {any} construction */
export function pruneIntersectsNotOnBody(host, construction) {
  if (!construction) return;
  for (const intersection of host.getConstructions().slice()) {
    if (
      intersection?.kind !== 'intersect' ||
      !intersection.lineIds?.includes(construction.id)
    ) {
      continue;
    }
    const point = intersection.els?.find(
      (element) => element?.elType === 'point' || element?.elType === 'glider',
    );
    if (!point) continue;

    let x;
    let y;
    try {
      const hit =
        typeof point._mathIntersectComputeRaw === 'function'
          ? point._mathIntersectComputeRaw()
          : null;
      if (hit) {
        x = hit.x;
        y = hit.y;
      } else {
        x = Number(point.X());
        y = Number(point.Y());
      }
    } catch {
      continue;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (!pointLiesOnConstr(construction, x, y)) {
      deleteConstruction(host, intersection.id);
      continue;
    }
    if (intersection.lineIds.length !== 2) continue;
    const otherId = intersection.lineIds.find((id) => id !== construction.id);
    const other = otherId ? host.findConstr(otherId) : null;
    if (other && !pointLiesOnConstr(other, x, y)) {
      deleteConstruction(host, intersection.id);
    }
  }
}
