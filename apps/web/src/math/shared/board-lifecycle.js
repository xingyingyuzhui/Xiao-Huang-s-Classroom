/**
 * 数学 JSXGraph 画板生命周期约定
 *
 * 硬规则（违反易出「幽灵对象 / 镜头重置 / 主题脏色」）：
 * 1. 从 state 移除引用前，必须先 detachBoardObject
 * 2. 业务 refresh（图例、重建曲线）禁止 setBoundingBox 到「设置初值」；
 *    重建前后用 withPreservedViewport 包住
 * 3. 换肤只走 restyleMathBoard + remintFunctionColors，监听 chem-theme-change
 */

import { restyleMathBoard } from './jsx-board.js';

/**
 * @param {any} board
 * @returns {number[] | null} [xMin, yMax, xMax, yMin]
 */
export function snapshotBoundingBox(board) {
  try {
    const bb = board?.getBoundingBox?.();
    if (Array.isArray(bb) && bb.length >= 4) return bb.slice(0, 4);
  } catch {
    /* */
  }
  return null;
}

/**
 * @param {any} board
 * @param {number[] | null | undefined} bb
 */
export function restoreBoundingBox(board, bb) {
  if (!board || !bb || bb.length < 4) return;
  try {
    board.setBoundingBox(bb, false);
  } catch {
    /* */
  }
}

/**
 * 在保留当前视窗的前提下执行重建逻辑
 * @param {any} board
 * @param {() => void} fn
 */
export function withPreservedViewport(board, fn) {
  const bb = snapshotBoundingBox(board);
  try {
    fn();
  } finally {
    restoreBoundingBox(board, bb);
    try {
      board?.update?.();
    } catch {
      /* */
    }
    // 再盖一次：部分路径内部 fullUpdate / 图例 refresh 会二次扰动
    restoreBoundingBox(board, bb);
    try {
      board?.update?.();
    } catch {
      /* */
    }
  }
}

/**
 * 从画板卸掉对象；失败也清空调用方引用责任在外
 * @param {any} board
 * @param {any} el
 * @returns {boolean} 是否尝试过 remove
 */
export function detachBoardObject(board, el) {
  if (!board || !el) return false;
  try {
    board.removeObject(el);
    return true;
  } catch {
    return false;
  }
}

/**
 * @typedef {{
 *   dispose: () => void,
 * }} ThemeRestyleHandle
 */

/**
 * 绑定 chem-theme-change：restyle 画板 + 可选业务回调（如 rebuildCurve）
 * @param {() => any | any[] | null | undefined} getBoards
 * @param {{ onAfterRestyle?: () => void }} [opts]
 * @returns {ThemeRestyleHandle}
 */
export function bindMathThemeRestyle(getBoards, opts = {}) {
  const handler = () => {
    try {
      const raw = getBoards?.();
      const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
      for (const b of list) {
        if (b) restyleMathBoard(b);
      }
    } catch {
      /* */
    }
    try {
      opts.onAfterRestyle?.();
    } catch {
      /* */
    }
  };
  window.addEventListener('chem-theme-change', handler);
  return {
    dispose() {
      window.removeEventListener('chem-theme-change', handler);
    },
  };
}
