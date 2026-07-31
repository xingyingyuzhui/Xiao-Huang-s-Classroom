/**
 * 高中解析几何：点、直线方程、圆、点到直线距离（纯函数）
 */

export const MAX_POINTS = 3;

/**
 * @typedef {{ id: string, x: number, y: number, label: string }} PlanePoint
 * @typedef {{ a: number, b: number, c: number }} LineGeneral
 * @typedef {{ m: number | null, b: number | null, vertical: boolean, x?: number }} SlopeIntercept
 */

/**
 * @param {number} x
 * @param {number} [decimals=2]
 */
export function roundCoord(x, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {PlanePoint[]} existing
 * @returns {PlanePoint | null}
 */
export function createPoint(x, y, existing) {
  if (existing.length >= MAX_POINTS) return null;
  const labels = ['A', 'B', 'C'];
  const used = new Set(existing.map((p) => p.label));
  const label = labels.find((l) => !used.has(l)) || `P${existing.length + 1}`;
  return {
    id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    x: roundCoord(x),
    y: roundCoord(y),
    label,
  };
}

/**
 * @param {PlanePoint} a
 * @param {PlanePoint} b
 */
export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * @param {PlanePoint} a
 * @param {PlanePoint} b
 */
export function midpoint(a, b) {
  return {
    x: roundCoord((a.x + b.x) / 2),
    y: roundCoord((a.y + b.y) / 2),
  };
}

/**
 * @param {PlanePoint} a
 * @param {PlanePoint} b
 * @returns {number | null}
 */
export function slope(a, b) {
  const dx = b.x - a.x;
  if (Math.abs(dx) < 1e-9) return null;
  return roundCoord((b.y - a.y) / dx, 4);
}

/**
 * 两点确定直线：一般式 Ax+By+C=0（化简整数感系数）
 * @param {PlanePoint} p1
 * @param {PlanePoint} p2
 * @returns {LineGeneral | null}
 */
export function lineGeneral(p1, p2) {
  if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 1e-9) return null;
  // (y-y1)(x2-x1) = (x-x1)(y2-y1)
  // (y2-y1)x - (x2-x1)y + (x2-x1)y1 - (y2-y1)x1 = 0
  let a = p2.y - p1.y;
  let b = p1.x - p2.x;
  let c = p2.x * p1.y - p1.x * p2.y;
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), 1e-9);
  a = roundCoord(a / scale, 4);
  b = roundCoord(b / scale, 4);
  c = roundCoord(c / scale, 4);
  if (a < 0 || (Math.abs(a) < 1e-9 && b < 0)) {
    a = -a;
    b = -b;
    c = -c;
  }
  return { a, b, c };
}

/**
 * @param {PlanePoint} p1
 * @param {PlanePoint} p2
 * @returns {SlopeIntercept | null}
 */
export function lineSlopeIntercept(p1, p2) {
  if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 1e-9) return null;
  const m = slope(p1, p2);
  if (m == null) {
    return { m: null, b: null, vertical: true, x: p1.x };
  }
  const intercept = roundCoord(p1.y - m * p1.x, 4);
  return { m, b: intercept, vertical: false };
}

/**
 * @param {LineGeneral} line
 * @param {PlanePoint} p
 */
export function pointToLineDistance(line, p) {
  const denom = Math.hypot(line.a, line.b);
  if (denom < 1e-9) return null;
  return roundCoord(Math.abs(line.a * p.x + line.b * p.y + line.c) / denom, 4);
}

/**
 * 圆心 O、圆周一点 P → 圆方程
 * @param {PlanePoint} center
 * @param {PlanePoint} rim
 */
export function circleFromCenterRim(center, rim) {
  const r = distance(center, rim);
  if (r < 1e-9) return null;
  return {
    h: center.x,
    k: center.y,
    r: roundCoord(r, 4),
    equation: `(x ${signedConst(-center.x)})² + (y ${signedConst(-center.y)})² = ${roundCoord(r * r, 4)}`,
  };
}

/**
 * @param {number} n
 */
function signedConst(n) {
  const r = roundCoord(n, 4);
  if (r === 0) return '';
  if (r > 0) return `+ ${r}`;
  return `− ${Math.abs(r)}`;
}

/**
 * @param {SlopeIntercept} si
 */
export function slopeInterceptText(si) {
  if (!si) return '';
  if (si.vertical) return `x = ${si.x}`;
  const m = si.m ?? 0;
  const b = si.b ?? 0;
  if (Math.abs(m) < 1e-9) return `y = ${b}`;
  if (Math.abs(b) < 1e-9) return `y = ${m}x`;
  return `y = ${m}x ${b >= 0 ? '+' : '−'} ${Math.abs(b)}`;
}

/**
 * @param {LineGeneral} g
 */
export function generalText(g) {
  if (!g) return '';
  const parts = [];
  if (Math.abs(g.a) > 1e-9) parts.push(`${g.a === 1 ? '' : g.a === -1 ? '−' : g.a}x`);
  if (Math.abs(g.b) > 1e-9) {
    const coef = g.b === 1 ? '+' : g.b === -1 ? '−' : g.b > 0 ? `+ ${g.b}` : `− ${Math.abs(g.b)}`;
    parts.push(`${coef}y`.replace(/^\+ /, '+ ').replace(/^− /, '− '));
  }
  if (Math.abs(g.c) > 1e-9) {
    parts.push(g.c > 0 ? `+ ${g.c}` : `− ${Math.abs(g.c)}`);
  }
  let s = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (s.startsWith('+ ')) s = s.slice(2);
  return `${s} = 0`;
}

/**
 * @param {PlanePoint[]} points
 */
export function analyticReport(points) {
  /** @type {Record<string, unknown>} */
  const report = {
    pairs: [],
    line: null,
    circle: null,
    pointLine: null,
  };

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i];
      const b = points[j];
      report.pairs.push({
        from: a.label,
        to: b.label,
        distance: roundCoord(distance(a, b), 4),
        midpoint: midpoint(a, b),
        slope: slope(a, b),
      });
    }
  }

  if (points.length >= 2) {
    const [p1, p2] = points;
    const g = lineGeneral(p1, p2);
    const si = lineSlopeIntercept(p1, p2);
    if (g && si) {
      report.line = {
        through: `${p1.label}${p2.label}`,
        slopeIntercept: slopeInterceptText(si),
        general: generalText(g),
        generalCoeffs: g,
      };
    }
  }

  if (points.length >= 2) {
    const [o, rim] = points;
    const circle = circleFromCenterRim(o, rim);
    if (circle) {
      report.circle = {
        center: o.label,
        rim: rim.label,
        ...circle,
      };
    }
  }

  if (points.length >= 3 && report.line?.generalCoeffs) {
    const p = points[2];
    const d = pointToLineDistance(report.line.generalCoeffs, p);
    report.pointLine = {
      point: p.label,
      line: report.line.through,
      distance: d,
    };
  }

  return report;
}

/**
 * @param {number} v
 */
export function snapHalf(v) {
  return Math.round(v * 2) / 2;
}

/** @deprecated use analyticReport */
export function pairStats(points) {
  return analyticReport(points).pairs;
}
