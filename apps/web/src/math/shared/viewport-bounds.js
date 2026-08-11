/**
 * 画板视口 AABB（用户坐标）。JSXGraph boundingBox: [xMin, yMax, xMax, yMin]
 */

/**
 * @param {any} board
 * @returns {{ xMin: number, xMax: number, yMin: number, yMax: number } | null}
 */
export function readViewportBounds(board) {
  try {
    const bb = board?.getBoundingBox?.();
    if (!Array.isArray(bb) || bb.length < 4) return null;
    const x0 = Number(bb[0]);
    const y0 = Number(bb[1]);
    const x1 = Number(bb[2]);
    const y1 = Number(bb[3]);
    if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
    return {
      xMin: Math.min(x0, x1),
      xMax: Math.max(x0, x1),
      yMin: Math.min(y0, y1),
      yMax: Math.max(y0, y1),
    };
  } catch {
    return null;
  }
}

/**
 * @param {number} x
 * @param {number} y
 * @param {{ xMin: number, xMax: number, yMin: number, yMax: number }} bounds
 * @param {number} [marginFrac=0.02] 相对宽高的边距
 */
export function pointInViewport(x, y, bounds, marginFrac = 0.02) {
  if (!bounds || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const mx = (bounds.xMax - bounds.xMin) * marginFrac;
  const my = (bounds.yMax - bounds.yMin) * marginFrac;
  return (
    x >= bounds.xMin - mx &&
    x <= bounds.xMax + mx &&
    y >= bounds.yMin - my &&
    y <= bounds.yMax + my
  );
}

/**
 * 视口过宽时压缩标签密度（宽度超过阈值则隐藏部分交点标签）。
 * @param {{ xMin: number, xMax: number }} bounds
 * @param {number} [widthThreshold=40]
 */
export function viewportTooWideForDenseLabels(bounds, widthThreshold = 40) {
  if (!bounds) return false;
  return bounds.xMax - bounds.xMin > widthThreshold;
}
