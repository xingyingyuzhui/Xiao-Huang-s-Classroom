/** JSXGraph 作图对象共用的低阶创建器。 */

import { applyBoardLabel, bindLiveLabel } from '../../shared/board-label.js';

/**
 * 创建可切换显隐的无限支撑线。
 * @param {any} board
 * @param {any} p1
 * @param {any} p2
 * @param {{ id: string, kind: string, extend?: boolean }} rec
 * @param {string} strokeColor
 */
export function createExtendRay(board, p1, p2, rec, strokeColor) {
  const ray = board.create('line', [p1, p2], {
    strokeColor,
    strokeWidth: 1.35,
    dash: 2,
    straightFirst: true,
    straightLast: true,
    fixed: true,
    withLabel: false,
    visible: Boolean(rec.extend),
    highlight: false,
  });
  ray._mathExtendRay = true;
  ray._mathConstr = true;
  ray._mathConstrId = rec.id;
  ray._mathConstrKind = rec.kind;
  try {
    ray.setAttribute({ layer: 6 });
  } catch {
    /* JSXGraph layer assignment is best-effort */
  }
  return ray;
}

/**
 * 垂足坐标标签：固定偏移和底衬，避免压在轴或垂线段上。
 * @param {any} foot
 * @param {() => string} getText
 * @param {string} color
 * @param {[number, number]} offset
 * @param {any[]} [watchEls]
 */
export function applyFootPointLabel(foot, getText, color, offset, watchEls = []) {
  applyBoardLabel(foot, {
    baseName: foot._mathBaseName || 'H',
    text: getText,
    color,
    offset,
  });
  try {
    foot.label?.setAttribute?.({
      autoPosition: false,
      offset,
      anchorX: 'middle',
      anchorY: 'middle',
      cssClass: 'JXGtext math-board-path-label',
      parse: false,
    });
  } catch {
    /* label may be absent on a partially initialized board */
  }
  bindLiveLabel(foot, getText, watchEls);
}
