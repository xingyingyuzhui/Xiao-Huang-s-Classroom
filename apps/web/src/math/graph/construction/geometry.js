/**
 * 作图的纯几何计算。
 *
 * 这里不创建 JSXGraph 元素，也不读取主题；这样交点和垂足算法可被直接测试。
 */

/**
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {number} x
 * @param {number} y
 * @param {number} [tol]
 */
export function pointOnSegmentCoords(a, b, x, y, tol = 0.08) {
  const x1 = Number(a?.x);
  const y1 = Number(a?.y);
  const x2 = Number(b?.x);
  const y2 = Number(b?.y);
  if (![x1, y1, x2, y2, x, y].every(Number.isFinite)) return false;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-16) return Math.hypot(x - x1, y - y1) <= tol;
  const t = ((x - x1) * dx + (y - y1) * dy) / len2;
  if (t < -1e-4 || t > 1 + 1e-4) return false;
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)) <= tol;
}

/**
 * @param {any} segEl
 * @param {number} x
 * @param {number} y
 * @param {number} [tol]
 */
export function pointOnSegment(segEl, x, y, tol = 0.08) {
  try {
    return pointOnSegmentCoords(
      { x: Number(segEl?.point1?.X()), y: Number(segEl?.point1?.Y()) },
      { x: Number(segEl?.point2?.X()), y: Number(segEl?.point2?.Y()) },
      x,
      y,
      tol,
    );
  } catch {
    return false;
  }
}

/**
 * 两条支撑直线的交点。平行或无效输入返回 null。
 * @param {any} lineA
 * @param {any} lineB
 * @returns {{ x: number, y: number } | null}
 */
export function lineLineIntersectionCoords(lineA, lineB) {
  try {
    const x1 = Number(lineA?.point1?.X());
    const y1 = Number(lineA?.point1?.Y());
    const x2 = Number(lineA?.point2?.X());
    const y2 = Number(lineA?.point2?.Y());
    const x3 = Number(lineB?.point1?.X());
    const y3 = Number(lineB?.point1?.Y());
    const x4 = Number(lineB?.point2?.X());
    const y4 = Number(lineB?.point2?.Y());
    if (![x1, y1, x2, y2, x3, y3, x4, y4].every(Number.isFinite)) return null;
    const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(d) < 1e-12) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
    const x = x1 + t * (x2 - x1);
    const y = y1 + t * (y2 - y1);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  } catch {
    return null;
  }
}

/**
 * 返回与切向量 (1, slope) 正交的有界方向向量。
 * @param {number} slope
 * @returns {{ x: number, y: number }}
 */
export function normalDirectionFromSlope(slope) {
  const value = Number(slope);
  if (Number.isNaN(value)) return { x: 0, y: 1 };
  if (!Number.isFinite(value)) {
    return { x: value > 0 ? -1 : 1, y: 0 };
  }
  if (value === 0) return { x: 0, y: 1 };
  const scale = Math.max(1, Math.abs(value));
  return { x: -value / scale, y: 1 / scale };
}

/**
 * 从点向 y=f(x) 数值求垂足；返回与切线正交且距离最短的候选点。
 * @param {{ getBoard: () => any, evalFnY: (fn: any, x: number) => number | null }} host
 * @param {any} fn
 * @param {number} px
 * @param {number} py
 * @returns {{ x: number, y: number } | null}
 */
export function findPerpFootOnFn(host, fn, px, py) {
  let xMin = -10;
  let xMax = 10;
  try {
    const bb = host.getBoard?.()?.getBoundingBox?.();
    if (bb?.length >= 4) {
      xMin = Math.min(Number(bb[0]), Number(bb[2]));
      xMax = Math.max(Number(bb[0]), Number(bb[2]));
    }
  } catch {
    /* use default viewport */
  }
  if (!(xMax > xMin) || !Number.isFinite(px) || !Number.isFinite(py)) return null;

  const slopeAt = (x) => {
    const h = 1e-4;
    const ya = host.evalFnY(fn, x - h);
    const yb = host.evalFnY(fn, x + h);
    return ya == null || yb == null ? null : (yb - ya) / (2 * h);
  };
  const residual = (x) => {
    const y = host.evalFnY(fn, x);
    const k = slopeAt(x);
    if (y == null || k == null || !Number.isFinite(k)) return null;
    return (x - px) + (y - py) * k;
  };

  /** @type {{ x: number, y: number, d: number } | null} */
  let best = null;
  const consider = (x) => {
    const y = host.evalFnY(fn, x);
    if (y == null || !Number.isFinite(y)) return;
    const d = (x - px) ** 2 + (y - py) ** 2;
    if (!best || d < best.d) best = { x, y, d };
  };

  const samples = 72;
  let prevX = xMin;
  let prev = residual(prevX);
  consider(prevX);
  for (let i = 1; i <= samples; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / samples;
    const value = residual(x);
    consider(x);
    if (prev != null && value != null && prev * value <= 0) {
      let lo = prevX;
      let hi = x;
      let flo = prev;
      for (let step = 0; step < 42; step += 1) {
        const mid = (lo + hi) / 2;
        const fm = residual(mid);
        if (fm == null) break;
        if (Math.abs(fm) < 1e-9 || Math.abs(hi - lo) < 1e-8) {
          lo = mid;
          break;
        }
        if (flo * fm <= 0) hi = mid;
        else {
          lo = mid;
          flo = fm;
        }
      }
      consider(lo);
    }
    prevX = x;
    prev = value;
  }
  return best ? { x: best.x, y: best.y } : null;
}
