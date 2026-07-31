/**
 * 高中三角函数：单位圆与特殊角（纯函数）
 */

export const SPECIAL_DEG = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];

/**
 * @param {number} deg
 */
export function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * @param {number} rad
 */
export function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

/**
 * @param {number} deg
 */
export function normalizeDeg(deg) {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

/**
 * @param {number} deg
 * @param {number} [tol=3]
 */
export function snapSpecialDeg(deg, tol = 3) {
  const d = normalizeDeg(deg);
  let best = d;
  let bestDiff = Infinity;
  for (const s of SPECIAL_DEG) {
    const diff = Math.min(Math.abs(d - s), 360 - Math.abs(d - s));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  return bestDiff <= tol ? best : d;
}

/**
 * @param {number} deg
 */
export function trigValues(deg) {
  const d = normalizeDeg(deg);
  const rad = degToRad(d);
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const tan = Math.abs(Math.cos(rad)) < 1e-10 ? null : Math.tan(rad);
  return {
    deg: round(d, 2),
    rad: round(rad, 4),
    sin: round(sin, 4),
    cos: round(cos, 4),
    tan: tan == null ? null : round(tan, 4),
    quadrant: quadrantOf(d),
  };
}

/**
 * @param {number} deg
 */
export function quadrantOf(deg) {
  const d = normalizeDeg(deg);
  if (d === 0 || d === 90 || d === 180 || d === 270) return '坐标轴';
  if (d > 0 && d < 90) return '第一象限';
  if (d > 90 && d < 180) return '第二象限';
  if (d > 180 && d < 270) return '第三象限';
  return '第四象限';
}

/**
 * 特殊角精确展示（教材常用根式）
 * @param {number} deg
 * @returns {{ sin: string, cos: string, tan: string } | null}
 */
export function exactSpecial(deg) {
  const d = normalizeDeg(deg);
  /** @type {Record<number, { sin: string, cos: string, tan: string }>} */
  const table = {
    0: { sin: '0', cos: '1', tan: '0' },
    30: { sin: '1/2', cos: '√3/2', tan: '1/√3' },
    45: { sin: '√2/2', cos: '√2/2', tan: '1' },
    60: { sin: '√3/2', cos: '1/2', tan: '√3' },
    90: { sin: '1', cos: '0', tan: '不存在' },
    120: { sin: '√3/2', cos: '−1/2', tan: '−√3' },
    135: { sin: '√2/2', cos: '−√2/2', tan: '−1' },
    150: { sin: '1/2', cos: '−√3/2', tan: '−1/√3' },
    180: { sin: '0', cos: '−1', tan: '0' },
    210: { sin: '−1/2', cos: '−√3/2', tan: '1/√3' },
    225: { sin: '−√2/2', cos: '−√2/2', tan: '1' },
    240: { sin: '−√3/2', cos: '−1/2', tan: '√3' },
    270: { sin: '−1', cos: '0', tan: '不存在' },
    300: { sin: '−√3/2', cos: '1/2', tan: '−√3' },
    315: { sin: '−√2/2', cos: '√2/2', tan: '−1' },
    330: { sin: '−1/2', cos: '√3/2', tan: '−1/√3' },
  };
  return table[d] ?? null;
}

/**
 * @param {number} n
 * @param {number} d
 */
function round(n, d) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
