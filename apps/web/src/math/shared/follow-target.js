/**
 * 跟随目标（多曲线 / 多线铺路）
 *
 * 当前图象 lab 只有一条主函数，但仍用「候选列表 + 最近吸附」接口，
 * 以后加曲线/直线时只需往 listFollowTargets 注册即可。
 */

/**
 * @typedef {'curve' | 'line' | 'circle' | 'other'} FollowTargetKind
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   kind: FollowTargetKind,
 *   el: any,
 *   distance: (x: number, y: number) => number | null,
 *   snap: (x: number, y: number) => { x: number, y: number } | null,
 * }} FollowTarget
 *
 * @typedef {{
 *   target: FollowTarget,
 *   distance: number,
 * }} FollowHit
 */

/**
 * 默认吸附容差（用户坐标），随画板视窗高度缩放
 * @param {any} [board]
 * @param {number} [fallback=0.35]
 */
export function defaultFollowTol(board, fallback = 0.35) {
  try {
    const bb = board?.getBoundingBox?.();
    if (bb) {
      const h = Math.abs(bb[1] - bb[3]);
      return Math.max(0.2, h * 0.03);
    }
  } catch {
    /* */
  }
  return fallback;
}

/**
 * 在候选中找距离 (x,y) 最近、且 ≤ tol 的目标
 * @param {number} x
 * @param {number} y
 * @param {FollowTarget[]} targets
 * @param {number} tol
 * @returns {FollowHit | null}
 */
export function findNearestFollowTarget(x, y, targets, tol) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Array.isArray(targets)) return null;
  let best = null;
  let bestD = Infinity;
  for (const t of targets) {
    if (!t || typeof t.distance !== 'function') continue;
    let d;
    try {
      d = t.distance(x, y);
    } catch {
      d = null;
    }
    if (d == null || !Number.isFinite(d)) continue;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  if (!best || bestD > tol) return null;
  return { target: best, distance: bestD };
}

/**
 * 不限容差，返回全局最近目标（用于「勾选跟随」时强绑最近曲线）
 * @param {number} x
 * @param {number} y
 * @param {FollowTarget[]} targets
 * @returns {FollowHit | null}
 */
export function findClosestFollowTarget(x, y, targets) {
  return findNearestFollowTarget(x, y, targets, Number.POSITIVE_INFINITY);
}

/**
 * @param {string} id
 * @param {FollowTarget[]} targets
 * @returns {FollowTarget | null}
 */
export function getFollowTargetById(id, targets) {
  if (!id || !Array.isArray(targets)) return null;
  return targets.find((t) => t && t.id === id) || null;
}

/**
 * 函数图 y=f(x) 型跟随目标
 * @param {{
 *   id: string,
 *   label?: string,
 *   el: any,
 *   evalY: (x: number) => number | null | undefined,
 * }} opts
 * @returns {FollowTarget}
 */
export function makeFunctionCurveTarget(opts) {
  const { id, el, evalY } = opts;
  const label = opts.label || id;
  return {
    id,
    label,
    kind: 'curve',
    el,
    distance(x, y) {
      const fy = evalY(x);
      if (fy == null || !Number.isFinite(Number(fy))) return null;
      return Math.abs(y - Number(fy));
    },
    snap(x, _y) {
      const fy = evalY(x);
      if (fy == null || !Number.isFinite(Number(fy))) return null;
      return { x, y: Number(fy) };
    },
  };
}

/**
 * 直线型跟随目标（未来直线与圆 / 多线铺路）
 * 一般式 Ax+By+C=0；el 供 glider 绑定。
 * @param {{
 *   id: string,
 *   label?: string,
 *   el: any,
 *   A: number,
 *   B: number,
 *   C: number,
 * }} opts
 * @returns {FollowTarget}
 */
export function makeLineFollowTarget(opts) {
  const { id, el, A, B, C } = opts;
  const label = opts.label || id;
  const norm = Math.hypot(A, B) || 1;
  return {
    id,
    label,
    kind: 'line',
    el,
    distance(x, y) {
      return Math.abs(A * x + B * y + C) / norm;
    },
    snap(x, y) {
      const den = A * A + B * B || 1;
      const t = -(A * x + B * y + C) / den;
      return { x: x + t * A, y: y + t * B };
    },
  };
}
