/**
 * 画板点拖动：吸附到整数格点 / 已有特殊点 / 坐标轴
 */

import { ensurePointGeomHook } from './board-label.js';

/**
 * @param {any} board
 * @returns {boolean}
 */
export function isSnapToIntegerEnabled(board) {
  try {
    const st = board?._mathAxisLegend?.getState?.();
    if (st && typeof st.snapToInteger === 'boolean') return st.snapToInteger;
  } catch {
    /* */
  }
  return true;
}

/**
 * @param {any} board
 * @returns {{ tolX: number, tolY: number }}
 */
export function snapTolerance(board) {
  const unitX = Math.abs(Number(board?.unitX) || 40) || 40;
  const unitY = Math.abs(Number(board?.unitY) || 40) || 40;
  return { tolX: 12 / unitX, tolY: 12 / unitY };
}

/**
 * 若靠近整数格点则吸附（容差约 12px）
 * @param {any} board
 * @param {number} x
 * @param {number} y
 * @returns {{ x: number, y: number }}
 */
export function snapCoordsToInteger(board, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x, y };
  if (!isSnapToIntegerEnabled(board)) return { x, y };
  const { tolX, tolY } = snapTolerance(board);
  const rx = Math.round(x);
  const ry = Math.round(y);
  return {
    x: Math.abs(x - rx) <= tolX ? rx : x,
    y: Math.abs(y - ry) <= tolY ? ry : y,
  };
}

/**
 * @typedef {{ x: number, y: number, el?: any }} SnapTarget
 */

/**
 * 吸附：已有点 → 坐标轴 → 整数格点
 * @param {any} board
 * @param {number} x
 * @param {number} y
 * @param {SnapTarget[]} [targets]
 * @param {{ excludeEl?: any }} [opts]
 * @returns {{ x: number, y: number }}
 */
export function snapCoordsAdvanced(board, x, y, targets = [], opts = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x, y };
  const { tolX, tolY } = snapTolerance(board);
  const exclude = opts.excludeEl || null;

  // 1) 附近已有特殊点（用户点 / 特征点 / 垂足 / 其它交点）
  let best = null;
  let bestD = Infinity;
  for (const t of targets || []) {
    if (!t) continue;
    if (exclude && t.el && t.el === exclude) continue;
    const tx = Number(t.x);
    const ty = Number(t.y);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
    const dx = Math.abs(x - tx);
    const dy = Math.abs(y - ty);
    if (dx > tolX || dy > tolY) continue;
    // 椭圆容差：归一化距离
    const d = (dx / tolX) ** 2 + (dy / tolY) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { x: tx, y: ty };
    }
  }
  if (best) return best;

  // 2) 贴坐标轴
  let ax = x;
  let ay = y;
  if (Math.abs(x) <= tolX) ax = 0;
  if (Math.abs(y) <= tolY) ay = 0;

  // 3) 整数格点（可关）
  return snapCoordsToInteger(board, ax, ay);
}

/**
 * @param {any} el
 * @param {() => any} getBoard
 * @param {{
 *   onSnapped?: () => void,
 *   getTargets?: () => SnapTarget[],
 * }} [opts]
 */
export function bindPointIntegerSnap(el, getBoard, opts = {}) {
  if (!el || el._mathSnapBound) return;
  el._mathSnapBound = true;
  el._mathSnapTick = () => {
    if (el.fixed || el.slideObject || el._mathFollow) return;
    // 约束交点（函数坐标）不直接拖，但允许在 tick 里由调用方处理
    if (el._mathIntersectLocked) return;
    const board = getBoard?.();
    if (!board) return;
    let x = 0;
    let y = 0;
    try {
      x = Number(el.X());
      y = Number(el.Y());
    } catch {
      return;
    }
    const targets =
      typeof opts.getTargets === 'function' ? opts.getTargets() || [] : [];
    const next = snapCoordsAdvanced(board, x, y, targets, { excludeEl: el });
    if (next.x === x && next.y === y) return;
    try {
      if (typeof el.setPositionDirectly === 'function') {
        el.setPositionDirectly(1, [next.x, next.y]);
      } else if (typeof el.moveTo === 'function') {
        el.moveTo([next.x, next.y], 0);
      } else if (typeof el.setPosition === 'function') {
        el.setPosition(1, [next.x, next.y]);
      }
      opts.onSnapped?.();
    } catch {
      /* */
    }
  };
  ensurePointGeomHook(el);
}
