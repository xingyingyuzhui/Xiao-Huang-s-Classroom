/**
 * 画板点拖动：吸附到附近整数坐标
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
 * 若靠近整数格点则吸附（容差约 12px）
 * @param {any} board
 * @param {number} x
 * @param {number} y
 * @returns {{ x: number, y: number }}
 */
export function snapCoordsToInteger(board, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x, y };
  if (!isSnapToIntegerEnabled(board)) return { x, y };
  const unitX = Math.abs(Number(board?.unitX) || 40) || 40;
  const unitY = Math.abs(Number(board?.unitY) || 40) || 40;
  const tolX = 12 / unitX;
  const tolY = 12 / unitY;
  const rx = Math.round(x);
  const ry = Math.round(y);
  return {
    x: Math.abs(x - rx) <= tolX ? rx : x,
    y: Math.abs(y - ry) <= tolY ? ry : y,
  };
}

/**
 * @param {any} el
 * @param {() => any} getBoard
 * @param {{ onSnapped?: () => void }} [opts]
 */
export function bindPointIntegerSnap(el, getBoard, opts = {}) {
  if (!el || el._mathSnapBound) return;
  el._mathSnapBound = true;
  el._mathSnapTick = () => {
    if (el.fixed || el.slideObject || el._mathFollow) return;
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
    const next = snapCoordsToInteger(board, x, y);
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
