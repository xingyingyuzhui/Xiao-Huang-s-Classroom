/**
 * 割线与平均变化率：纯数学（可单测）。
 *
 * secantMetrics(evaluate, x1, x2)：
 * - p1/p2 为曲线上两点；dx/dy/slope 为差与平均变化率；
 * - x1===x2 或差值过小（epsilon）拒绝；
 * - 定义域外 / Infinity / NaN → valid:false，不抛错。
 */

export const SECANT_EPSILON = 1e-9;

/** @param {number} value @param {number} [maxDecimals] */
export function formatSecantNumber(value, maxDecimals = 2) {
  if (!Number.isFinite(value)) return '—';
  const f = Number(value.toFixed(maxDecimals));
  return Object.is(f, -0) ? '0' : String(f);
}

/**
 * @param {(x: number) => number | null} evaluate
 * @param {number} x1
 * @param {number} x2
 * @param {{ epsilon?: number }} [options]
 * @returns {{
 *   p1: { x: number, y: number } | null,
 *   p2: { x: number, y: number } | null,
 *   dx: number | null,
 *   dy: number | null,
 *   slope: number | null,
 *   midpoint: { x: number, y: number } | null,
 *   valid: boolean,
 * }}
 */
export function secantMetrics(evaluate, x1, x2, options = {}) {
  const epsilon = Number.isFinite(options.epsilon) ? options.epsilon : SECANT_EPSILON;
  if (typeof evaluate !== 'function' || !Number.isFinite(x1) || !Number.isFinite(x2)) {
    return emptyResult();
  }
  const dx = x2 - x1;
  if (Math.abs(dx) <= epsilon) {
    return { ...emptyResult(), dx, dy: null, slope: null, valid: false };
  }
  let y1 = null;
  let y2 = null;
  try {
    y1 = evaluate(x1);
    y2 = evaluate(x2);
  } catch {
    return emptyResult();
  }
  const finite1 = y1 != null && Number.isFinite(y1);
  const finite2 = y2 != null && Number.isFinite(y2);
  if (!finite1 || !finite2) {
    return { ...emptyResult(), dx, valid: false };
  }
  const dy = y2 - y1;
  const slope = dy / dx;
  const p1 = { x: x1, y: y1 };
  const p2 = { x: x2, y: y2 };
  return {
    p1,
    p2,
    dx,
    dy,
    slope,
    midpoint: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
    valid: true,
  };
}

/** @returns {{ p1: null, p2: null, dx: null, dy: null, slope: null, midpoint: null, valid: false }} */
function emptyResult() {
  return { p1: null, p2: null, dx: null, dy: null, slope: null, midpoint: null, valid: false };
}

/**
 * 「趋近切线」播放参数：在 [x1, x2] 区间内按 t ∈ [0,1] 插值 x2 位置。
 * 纯函数，动画帧只喂 t。
 * @param {number} x1
 * @param {number} x2
 * @param {number} t
 */
export function interpolateSecantX2(x1, x2, t) {
  const clamped = Math.min(1, Math.max(0, t));
  return x1 + (x2 - x1) * clamped;
}
