/**
 * 高中函数族采样与关键特征（无 eval）
 */

/**
 * @typedef {'linear' | 'quadratic' | 'power' | 'exp' | 'log' | 'abs' | 'inverse' | 'sine' | 'cosine'} GraphPresetId
 * @typedef {{ a: number, b: number, c: number }} GraphCoeffs
 */

/** @type {Array<{ id: GraphPresetId, label: string, tip: string, formula: (c: GraphCoeffs) => string }>} */
export const GRAPH_PRESETS = [
  {
    id: 'linear',
    label: '一次',
    tip: 'y = ax + b',
    formula: ({ a, b }) => `y = ${fmt(a)}x ${signed(b)}`,
  },
  {
    id: 'quadratic',
    label: '二次',
    tip: 'y = ax² + bx + c',
    formula: ({ a, b, c }) => `y = ${fmt(a)}x² ${signed(b)}x ${signed(c)}`,
  },
  {
    id: 'power',
    label: '幂函数',
    tip: 'y = a xⁿ（n=b）',
    formula: ({ a, b }) => `y = ${fmt(a)} x^{${fmt(b)}}`,
  },
  {
    id: 'exp',
    label: '指数',
    tip: 'y = a · e^{bx} + c',
    formula: ({ a, b, c }) => `y = ${fmt(a)} e^{${fmt(b)}x} ${signed(c)}`,
  },
  {
    id: 'log',
    label: '对数',
    tip: 'y = a ln(x − b) + c（x>b）',
    formula: ({ a, b, c }) => `y = ${fmt(a)} ln(x ${signed(-b)}) ${signed(c)}`,
  },
  {
    id: 'abs',
    label: '绝对值',
    tip: 'y = a |x − b| + c',
    formula: ({ a, b, c }) => `y = ${fmt(a)} |x ${signed(-b)}| ${signed(c)}`,
  },
  {
    id: 'inverse',
    label: '反比例',
    tip: 'y = a / x',
    formula: ({ a }) => `y = ${fmt(a)} / x`,
  },
  {
    id: 'sine',
    label: '正弦',
    tip: 'y = a sin(bx + c)',
    formula: ({ a, b, c }) => `y = ${fmt(a)} sin(${fmt(b)}x ${signed(c)})`,
  },
  {
    id: 'cosine',
    label: '余弦',
    tip: 'y = a cos(bx + c)',
    formula: ({ a, b, c }) => `y = ${fmt(a)} cos(${fmt(b)}x ${signed(c)})`,
  },
];

/**
 * @param {number} n
 */
function fmt(n) {
  const r = Math.round(n * 100) / 100;
  if (Object.is(r, -0)) return '0';
  return String(r);
}

/**
 * @param {number} n
 */
function signed(n) {
  const r = Math.round(n * 100) / 100;
  if (r >= 0) return `+ ${r}`;
  return `− ${Math.abs(r)}`;
}

/**
 * @param {GraphPresetId} preset
 * @param {GraphCoeffs} coeffs
 * @param {number} x
 * @returns {number | null}
 */
export function evalPreset(preset, coeffs, x) {
  const { a, b, c } = coeffs;
  switch (preset) {
    case 'linear':
      return a * x + b;
    case 'quadratic':
      return a * x * x + b * x + c;
    case 'power': {
      if (x < 0 && Math.abs(b % 1) > 1e-9) return null;
      if (x === 0 && b < 0) return null;
      const y = a * x ** b;
      return Number.isFinite(y) ? y : null;
    }
    case 'exp':
      return a * Math.exp(b * x) + c;
    case 'log': {
      const u = x - b;
      if (u <= 1e-9) return null;
      return a * Math.log(u) + c;
    }
    case 'abs':
      return a * Math.abs(x - b) + c;
    case 'inverse':
      if (Math.abs(x) < 1e-6) return null;
      return a / x;
    case 'sine':
      return a * Math.sin(b * x + c);
    case 'cosine':
      return a * Math.cos(b * x + c);
    default:
      return null;
  }
}

/**
 * @param {GraphPresetId} preset
 * @param {GraphCoeffs} coeffs
 * @param {{ xMin: number, xMax: number, steps?: number }} range
 */
export function sampleCurve(preset, coeffs, range) {
  const steps = range.steps ?? 360;
  const { xMin, xMax } = range;
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = xMin + (xMax - xMin) * t;
    const y = evalPreset(preset, coeffs, x);
    pts.push({
      x,
      y: y == null || !Number.isFinite(y) ? null : y,
    });
  }
  return pts;
}

/**
 * 渐近线（竖直 / 水平），供画布参考线
 * @param {GraphPresetId} preset
 * @param {GraphCoeffs} coeffs
 * @returns {Array<{ type: 'vertical' | 'horizontal', value: number, label: string }>}
 */
export function asymptotes(preset, coeffs) {
  const { a, b, c } = coeffs;
  if (preset === 'inverse') {
    return [
      { type: 'vertical', value: 0, label: 'x = 0' },
      { type: 'horizontal', value: 0, label: 'y = 0' },
    ];
  }
  if (preset === 'log') {
    return [{ type: 'vertical', value: b, label: `x = ${fmt(b)}` }];
  }
  if (preset === 'exp') {
    return [{ type: 'horizontal', value: c, label: `y = ${fmt(c)}` }];
  }
  if (preset === 'power' && b < 0) {
    return [{ type: 'vertical', value: 0, label: 'x = 0' }];
  }
  if (preset === 'abs' || preset === 'linear' || preset === 'quadratic') {
    return [];
  }
  return a ? [] : [];
}

/**
 * 二次：顶点
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @returns {{ h: number, k: number } | null}
 */
export function vertex(a, b, c) {
  if (Math.abs(a) < 1e-12) return null;
  const h = -b / (2 * a);
  const k = (4 * a * c - b * b) / (4 * a);
  return { h, k };
}

/**
 * 二次：判别式 Δ
 * @param {number} a
 * @param {number} b
 * @param {number} c
 */
export function discriminant(a, b, c) {
  return b * b - 4 * a * c;
}

/**
 * 二次：实根（升序）
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @returns {number[]}
 */
export function roots(a, b, c) {
  if (Math.abs(a) < 1e-12) return [];
  const d = discriminant(a, b, c);
  if (d < -1e-12) return [];
  if (Math.abs(d) <= 1e-12) return [-b / (2 * a)];
  const s = Math.sqrt(d);
  return [(-b - s) / (2 * a), (-b + s) / (2 * a)].sort((x, y) => x - y);
}

/**
 * 二次：单调区间文案
 * @param {number} a
 * @param {number} b
 * @returns {{ increasing: string[], decreasing: string[] }}
 */
export function monotonicIntervals(a, b) {
  if (Math.abs(a) < 1e-12) {
    if (b > 0) return { increasing: ['(-∞,+∞)'], decreasing: [] };
    if (b < 0) return { increasing: [], decreasing: ['(-∞,+∞)'] };
    return { increasing: [], decreasing: [] };
  }
  const h = -b / (2 * a);
  const hs = Number(h.toFixed(4));
  if (a > 0) {
    return {
      decreasing: [`(-∞,${hs}]`],
      increasing: [`[${hs},+∞)`],
    };
  }
  return {
    increasing: [`(-∞,${hs}]`],
    decreasing: [`[${hs},+∞)`],
  };
}

/**
 * 由顶点式 y = a(x-h)² + k 还原一般式系数
 * @param {number} a
 * @param {number} h
 * @param {number} k
 * @returns {GraphCoeffs}
 */
export function coeffsFromVertex(a, h, k) {
  return {
    a,
    b: -2 * a * h,
    c: a * h * h + k,
  };
}

/**
 * 关键特征点 / 说明
 * @param {GraphPresetId} preset
 * @param {GraphCoeffs} coeffs
 * @returns {Array<{ kind: string, text: string, x?: number, y?: number }>}
 */
export function keyFeatures(preset, coeffs) {
  const { a, b, c } = coeffs;
  /** @type {Array<{ kind: string, text: string, x?: number, y?: number }>} */
  const out = [];

  if (preset === 'linear') {
    out.push({ kind: '截距', text: `纵截距 (0, ${fmt(b)})`, x: 0, y: b });
    if (Math.abs(a) > 1e-9) {
      const xz = -b / a;
      out.push({ kind: '零点', text: `零点 (${fmt(xz)}, 0)`, x: xz, y: 0 });
      out.push({ kind: '斜率', text: `k = ${fmt(a)}` });
    }
  }

  if (preset === 'quadratic' && Math.abs(a) > 1e-9) {
    const v = vertex(a, b, c);
    const vx = v ? v.h : -b / (2 * a);
    const vy = v ? v.k : a * vx * vx + b * vx + c;
    out.push({
      kind: '顶点',
      text: `顶点 (${fmt(vx)}, ${fmt(vy)})，开口${a > 0 ? '向上' : '向下'}`,
      x: vx,
      y: vy,
    });
    const disc = discriminant(a, b, c);
    out.push({ kind: '判别式', text: `Δ = ${fmt(disc)}` });
    const rs = roots(a, b, c);
    if (rs.length === 2) {
      out.push({ kind: '零点', text: `x₁ = ${fmt(rs[0])}, x₂ = ${fmt(rs[1])}`, x: rs[0], y: 0 });
    } else if (rs.length === 1) {
      out.push({ kind: '零点', text: `重根 x = ${fmt(rs[0])}`, x: rs[0], y: 0 });
    } else {
      out.push({ kind: '零点', text: '无实根' });
    }
    out.push({ kind: '对称轴', text: `x = ${fmt(vx)}` });
  }

  if (preset === 'exp') {
    out.push({ kind: '过点', text: `(0, ${fmt(a + c)})`, x: 0, y: a + c });
    out.push({ kind: '水平渐近线', text: `y = ${fmt(c)}` });
    out.push({ kind: '单调', text: b > 0 ? '在 R 上单调递增' : b < 0 ? '在 R 上单调递减' : '常值' });
  }

  if (preset === 'log') {
    out.push({ kind: '定义域', text: `x > ${fmt(b)}` });
    out.push({ kind: '竖直渐近线', text: `x = ${fmt(b)}` });
    const x1 = b + 1;
    out.push({ kind: '过点', text: `(${fmt(x1)}, ${fmt(c)})`, x: x1, y: c });
  }

  if (preset === 'abs') {
    out.push({ kind: '顶点', text: `(${fmt(b)}, ${fmt(c)})`, x: b, y: c });
    out.push({ kind: '对称轴', text: `x = ${fmt(b)}` });
  }

  if (preset === 'inverse') {
    out.push({ kind: '渐近线', text: 'x = 0, y = 0' });
    out.push({ kind: '奇偶', text: '奇函数（关于原点对称）' });
  }

  if (preset === 'power') {
    out.push({ kind: '定义域', text: b % 1 === 0 ? 'R（注意 0 的负指数）' : '[0, +∞)' });
    if (Math.abs(b - 1) < 1e-9) out.push({ kind: '特例', text: '退化为一次函数' });
    if (Math.abs(b - 2) < 1e-9) out.push({ kind: '特例', text: '退化为开口向上的二次型' });
  }

  if (preset === 'sine' || preset === 'cosine') {
    const amp = Math.abs(a);
    const period = Math.abs(b) > 1e-9 ? roundPeriod((2 * Math.PI) / Math.abs(b)) : null;
    out.push({ kind: '振幅', text: `A = ${fmt(amp)}` });
    if (period != null) out.push({ kind: '周期', text: `T = ${fmt(period)}` });
    out.push({ kind: '初相', text: `φ = ${fmt(c)}` });
  }

  return out;
}

/**
 * @param {number} t
 */
function roundPeriod(t) {
  return Math.round(t * 1000) / 1000;
}

/**
 * @param {GraphPresetId} preset
 * @param {GraphCoeffs} coeffs
 */
export function formulaText(preset, coeffs) {
  const meta = GRAPH_PRESETS.find((p) => p.id === preset);
  return meta ? meta.formula(coeffs) : '';
}

/**
 * 各预设默认系数（高中常见形态）
 * @param {GraphPresetId} preset
 */
export function defaultCoeffsFor(preset) {
  switch (preset) {
    case 'linear':
      return { a: 1, b: -1, c: 0 };
    case 'quadratic':
      return { a: 0.5, b: -1, c: -1.5 };
    case 'power':
      return { a: 1, b: 0.5, c: 0 };
    case 'exp':
      return { a: 1, b: 0.4, c: 0 };
    case 'log':
      return { a: 1, b: 0, c: 0 };
    case 'abs':
      return { a: 1, b: 0, c: 0 };
    case 'inverse':
      return { a: 4, b: 0, c: 0 };
    case 'sine':
      return { a: 2, b: 1, c: 0 };
    case 'cosine':
      return { a: 2, b: 1, c: 0 };
    default:
      return { a: 1, b: 0, c: 0 };
  }
}

export const DEFAULT_COEFFS = { a: 1, b: 0, c: 0 };
