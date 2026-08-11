/**
 * 重合点标签融合：snap 容差内连通分量只显示一条拼接标签（纯显示层）。
 */

import { formatCoordsPair } from './board-label.js';
import { snapTolerance } from './board-snap.js';
import {
  pointInViewport,
  readViewportBounds,
  viewportTooWideForDenseLabels,
} from './viewport-bounds.js';

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
 * @typedef {{ members: any[], representative: any }} PointLabelCluster
 * @typedef {{
 *   xyReads: number,
 *   distanceChecks: number,
 *   unions: number,
 *   buckets: number,
 * }} FusionOpStats
 */

/**
 * 密集友好的标签融合分桶：
 * - 同桶直接全员 union（坐标差必然 ≤ tol，无需点对）
 * - 邻桶只查 4 个正向邻居；一旦发现一对 nearby 就 union 两个桶代表
 * - 邻桶扫描用按 X 排序的滑动窗口，避免笛卡尔积
 *
 * @param {any[]} elements
 * @param {{ tolX: number, tolY: number }} tol
 * @param {{ stats?: FusionOpStats }} [opts]
 * @returns {PointLabelCluster[]}
 */
export function clusterLabeledPoints(elements, tol, opts = {}) {
  const pts = (elements || []).filter(isLabeledPointCandidate);
  const n = pts.length;
  /** @type {FusionOpStats} */
  const stats = opts.stats || {
    xyReads: 0,
    distanceChecks: 0,
    unions: 0,
    buckets: 0,
  };

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
    if (a !== b) {
      parent[b] = a;
      stats.unions += 1;
    }
  };

  const cellW = Math.max(Number(tol.tolX) || 1e-6, 1e-9);
  const cellH = Math.max(Number(tol.tolY) || 1e-6, 1e-9);
  /** @type {Array<{ x: number, y: number, cx: number, cy: number, ok: boolean }>} */
  const coords = new Array(n);
  /** @type {Map<string, number[]>} */
  const buckets = new Map();

  for (let i = 0; i < n; i += 1) {
    let x = NaN;
    let y = NaN;
    try {
      x = Number(pts[i].X());
      y = Number(pts[i].Y());
      stats.xyReads += 2;
    } catch {
      /* */
    }
    const ok = Number.isFinite(x) && Number.isFinite(y);
    const cx = ok ? Math.floor(x / cellW) : 0;
    const cy = ok ? Math.floor(y / cellH) : 0;
    coords[i] = { x, y, cx, cy, ok };
    if (!ok) continue;
    const key = `${cx},${cy}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(i);
  }
  stats.buckets = buckets.size;

  // 同桶：全部连通到第一个成员
  for (const members of buckets.values()) {
    if (members.length < 2) continue;
    const rep = members[0];
    for (let k = 1; k < members.length; k += 1) unite(rep, members[k]);
  }

  const neighborOffsets = [
    [1, 0], // right
    [0, 1], // up
    [1, 1], // right-up
    [1, -1], // right-down
  ];

  /**
   * 两桶是否存在至少一对 nearby；用较小桶 × 滑动窗口，避免全笛卡尔。
   * @param {number[]} a
   * @param {number[]} b
   */
  const bucketsTouch = (a, b) => {
    const left = a.length <= b.length ? a : b;
    const right = a.length <= b.length ? b : a;
    const sorted = right
      .slice()
      .sort((i, j) => coords[i].x - coords[j].x || coords[i].y - coords[j].y);
    for (const i of left) {
      const ci = coords[i];
      // 在 sorted 中找 x 落入 [ci.x - tolX, ci.x + tolX] 的窗口
      let lo = 0;
      let hi = sorted.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (coords[sorted[mid]].x < ci.x - cellW) lo = mid + 1;
        else hi = mid;
      }
      for (let p = lo; p < sorted.length; p += 1) {
        const j = sorted[p];
        const cj = coords[j];
        if (cj.x > ci.x + cellW) break;
        stats.distanceChecks += 1;
        if (Math.abs(ci.x - cj.x) <= cellW && Math.abs(ci.y - cj.y) <= cellH) {
          return true;
        }
      }
    }
    return false;
  };

  for (const [key, members] of buckets) {
    const comma = key.indexOf(',');
    const cx = Number(key.slice(0, comma));
    const cy = Number(key.slice(comma + 1));
    const repA = members[0];
    for (const [ox, oy] of neighborOffsets) {
      const other = buckets.get(`${cx + ox},${cy + oy}`);
      if (!other?.length) continue;
      if (bucketsTouch(members, other)) unite(repA, other[0]);
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
 * @deprecated nearby 逐点比较已退役；保留导出避免旧测试硬依赖时可删除
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
void nearby;

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
 * 视口过宽时隐藏未选中交点标签，减轻密集标签开销。
 * @param {any} board
 * @param {any[]} elements
 */
export function applyDenseIntersectLabelPolicy(board, elements) {
  const bounds = readViewportBounds(board);
  const dense = viewportTooWideForDenseLabels(bounds);
  for (const el of elements || []) {
    if (!el || el._mathConstrKind !== 'intersect') continue;
    if (el._mathLabelHiddenForDrag || el._mathLabelFusionSuppressed) continue;
    if (el._mathIntersectOnBody === false) continue;
    if (dense && !el._mathSelChrome && !el._mathIntersectHoverCoords) {
      try {
        el.label?.setAttribute?.({ visible: false });
      } catch {
        /* */
      }
      el._mathDenseLabelHidden = true;
    } else if (el._mathDenseLabelHidden) {
      el._mathDenseLabelHidden = false;
      try {
        el.label?.setAttribute?.({ visible: true });
      } catch {
        /* */
      }
    }
    // 视口外：标签与点一并隐藏（与 syncIntersectVisibility 双保险）
    if (bounds) {
      try {
        const x = Number(el.X());
        const y = Number(el.Y());
        if (Number.isFinite(x) && Number.isFinite(y) && !pointInViewport(x, y, bounds)) {
          el.label?.setAttribute?.({ visible: false });
        }
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
  const els = listElements() || [];
  applyPointLabelFusion(els, tol);
  applyDenseIntersectLabelPolicy(board, els);
}
