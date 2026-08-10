/**
 * 割线与平均变化率：纯数学（可单测）。
 *
 * secantMetrics(evaluate, x1, x2)：
 * - p1/p2 为曲线上两点；dx/dy/slope 为差与平均变化率；
 * - x1===x2 或差值过小（epsilon）拒绝；
 * - 定义域外 / Infinity / NaN → valid:false，不抛错。
 *
 * C2 硬化样板（2026-08-10）：JS → TS 权威（行为逐字；无 any）。
 * 无生产消费方（割线交互在 graph-tool-controller，本模块为纯数值库，
 * 测试已迁 vitest）；结构测 PURE_LAYERS 白名单同步。
 */

export const SECANT_EPSILON = 1e-9;

export function formatSecantNumber(value: number, maxDecimals = 2): string {
  if (!Number.isFinite(value)) return '—';
  const f = Number(value.toFixed(maxDecimals));
  return Object.is(f, -0) ? '0' : String(f);
}

export interface SecantPoint {
  x: number;
  y: number;
}

export interface SecantMetrics {
  p1: SecantPoint | null;
  p2: SecantPoint | null;
  dx: number | null;
  dy: number | null;
  slope: number | null;
  midpoint: SecantPoint | null;
  valid: boolean;
}

export function secantMetrics(
  evaluate: (x: number) => number | null,
  x1: number,
  x2: number,
  options: { epsilon?: number } = {},
): SecantMetrics {
  const epsilon =
    options.epsilon !== undefined && Number.isFinite(options.epsilon)
      ? options.epsilon
      : SECANT_EPSILON;
  if (typeof evaluate !== 'function' || !Number.isFinite(x1) || !Number.isFinite(x2)) {
    return emptyResult();
  }
  const dx = x2 - x1;
  if (Math.abs(dx) <= epsilon) {
    return { ...emptyResult(), dx, dy: null, slope: null, valid: false };
  }
  let y1: number | null;
  let y2: number | null;
  try {
    y1 = evaluate(x1);
    y2 = evaluate(x2);
  } catch {
    return emptyResult();
  }
  if (y1 == null || !Number.isFinite(y1) || y2 == null || !Number.isFinite(y2)) {
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

function emptyResult(): SecantMetrics {
  return { p1: null, p2: null, dx: null, dy: null, slope: null, midpoint: null, valid: false };
}

/**
 * 「趋近切线」播放参数：在 [x1, x2] 区间内按 t ∈ [0,1] 插值 x2 位置。
 * 纯函数，动画帧只喂 t。
 */
export function interpolateSecantX2(x1: number, x2: number, t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return x1 + (x2 - x1) * clamped;
}
