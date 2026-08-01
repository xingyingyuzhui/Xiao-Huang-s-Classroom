/**
 * 重合点标签融合：snap 容差内连通分量只显示一条拼接标签（纯显示层）。
 */

import { formatCoordsPair } from './board-label.js';
import { snapTolerance } from './board-snap.js';

const POINT_TYPES = new Set(['point', 'glider', 'perpendicularpoint']);

/**
 * @param {any} el
 * @returns {{ role: string, rank: number }}
 */
export function classifyPointRole(el) {
  if (el?._mathUserPoint === true) return { role: 'user', rank: 0 };
  if (el?._mathConstrKind === 'intersect') return { role: 'intersect', rank: 1 };
  if (
    el?.elType === 'perpendicularpoint' ||
    (el?._mathConstrKind === 'perp' && POINT_TYPES.has(el?.elType))
  ) {
    return { role: 'foot', rank: 2 };
  }
  if (el?._mathFeatureMark === true) return { role: 'feature', rank: 3 };
  return { role: 'other', rank: 4 };
}

/**
 * @param {any} el
 * @returns {boolean}
 */
export function isLabeledPointCandidate(el) {
  if (!el || el._is_removed) return false;
  if (!POINT_TYPES.has(el.elType)) return false;
  if (el._mathExtendRay) return false;
  if (el.visProp?.visible === false) return false;
  if (typeof el._mathBaseName !== 'string' || !el._mathBaseName) return false;
  if (el._mathLiveLabelBound !== true) return false;
  if (el._mathIntersectOnBody === false) return false;
  return true;
}

/**
 * @param {any} el
 * @returns {string}
 */
function stablePointId(el) {
  if (el?.id != null) return String(el.id);
  if (el?._mathConstrId != null) return String(el._mathConstrId);
  return el?._mathBaseName ? String(el._mathBaseName) : '';
}

/**
 * @param {any} a
 * @param {any} b
 * @returns {number}
 */
export function compareLabeledPoints(a, b) {
  const ra = classifyPointRole(a).rank;
  const rb = classifyPointRole(b).rank;
  if (ra !== rb) return ra - rb;
  const na = String(a?._mathBaseName || '');
  const nb = String(b?._mathBaseName || '');
  if (na !== nb) return na < nb ? -1 : 1;
  const ia = stablePointId(a);
  const ib = stablePointId(b);
  if (ia !== ib) return ia < ib ? -1 : 1;
  return 0;
}

/**
 * @param {any} a
 * @param {any} b
 * @param {{ tolX: number, tolY: number }} tol
 */
function nearby(a, b, tol) {
  try {
    const dx = Math.abs(Number(a.X()) - Number(b.X()));
    const dy = Math.abs(Number(a.Y()) - Number(b.Y()));
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    return dx <= tol.tolX && dy <= tol.tolY;
  } catch {
    return false;
  }
}

/**
 * @typedef {{ members: any[], representative: any }} PointLabelCluster
 */

/**
 * AABB 邻接连通分量；单点也返回（便于 apply 清 suppress）。
 * @param {any[]} elements
 * @param {{ tolX: number, tolY: number }} tol
 * @returns {PointLabelCluster[]}
 */
export function clusterLabeledPoints(elements, tol) {
  const pts = (elements || []).filter(isLabeledPointCandidate);
  const n = pts.length;
  /** @type {number[]} */
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => {
    let x = i;
    while (parent[x] !== x) x = parent[x];
    let y = i;
    while (parent[y] !== y) {
      const p = parent[y];
      parent[y] = x;
      y = p;
    }
    return x;
  };
  const unite = (i, j) => {
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[b] = a;
  };

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (nearby(pts[i], pts[j], tol)) unite(i, j);
    }
  }

  /** @type {Map<number, any[]>} */
  const groups = new Map();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(pts[i]);
  }

  /** @type {PointLabelCluster[]} */
  const clusters = [];
  for (const members of groups.values()) {
    const sorted = members.slice().sort(compareLabeledPoints);
    clusters.push({ members: sorted, representative: sorted[0] });
  }
  return clusters;
}

/**
 * @param {PointLabelCluster} cluster
 * @param {number} [maxDecimals=2]
 */
export function formatFusedPointLabel(cluster, maxDecimals = 2) {
  const members = cluster?.members || [];
  if (!members.length) return '';
  const names = members.map((el) => String(el._mathBaseName || 'P'));
  const joined = names.join('·');
  const showCoords = members.some((el) => el._mathShowCoords);
  if (!showCoords) return joined;
  const rep = cluster.representative || members[0];
  try {
    const x = Number(rep.X());
    const y = Number(rep.Y());
    if (!Number.isFinite(x) || !Number.isFinite(y)) return joined;
    return `${joined}${formatCoordsPair(x, y, maxDecimals)}`;
  } catch {
    return joined;
  }
}

/**
 * @param {any} el
 * @param {string | (() => string)} text
 */
function writeLabel(el, text) {
  if (!el) return;
  const content = typeof text === 'function' ? text : () => String(text ?? '');
  if (el.elType === 'text' || (!el.label && typeof el.setText === 'function')) {
    try {
      el.setText(content);
    } catch {
      try {
        el.setAttribute?.({ text: content() });
      } catch {
        /* */
      }
    }
    return;
  }
  if (!el.label) return;
  try {
    el.label.setText(content);
  } catch {
    try {
      el.label.setAttribute?.({ text: content() });
    } catch {
      /* */
    }
  }
}

/**
 * @param {any[]} elements
 * @param {{ tolX: number, tolY: number }} tol
 */
export function applyPointLabelFusion(elements, tol) {
  const clusters = clusterLabeledPoints(elements, tol);
  /** @type {Set<any>} */
  const touched = new Set();

  for (const cluster of clusters) {
    if (cluster.members.length < 2) {
      const alone = cluster.members[0];
      if (!alone) continue;
      alone._mathLabelFusionSuppressed = false;
      try {
        alone._mathLiveLabelTick?.();
      } catch {
        /* */
      }
      touched.add(alone);
      continue;
    }
    const fused = formatFusedPointLabel(cluster);
    for (const el of cluster.members) {
      touched.add(el);
      if (el === cluster.representative) {
        el._mathLabelFusionSuppressed = false;
        writeLabel(el, fused);
      } else {
        el._mathLabelFusionSuppressed = true;
        writeLabel(el, '');
      }
    }
  }

  for (const el of elements || []) {
    if (!el || touched.has(el)) continue;
    if (el._mathLabelFusionSuppressed) {
      el._mathLabelFusionSuppressed = false;
      try {
        el._mathLiveLabelTick?.();
      } catch {
        /* */
      }
    }
  }
}

/**
 * @param {any} board
 * @param {() => any[]} listElements
 */
export function refreshPointLabelFusionOnBoard(board, listElements) {
  if (!board || typeof listElements !== 'function') return;
  const tol = snapTolerance(board);
  applyPointLabelFusion(listElements() || [], tol);
}
