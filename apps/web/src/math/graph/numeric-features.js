/**
 * 自定义函数数值特征分析：有边界的两阶段算法。
 *
 * 结果可信度合同：
 * - interval: 分析区间
 * - zeros: [{ x, residual, confidence }]
 * - extrema: [{ x, y, kind: 'min'|'max', confidence }]
 * - discontinuities: [{ x, kind: 'possible', confidence }]（只能标「疑似」）
 * - monotonic: [{ from, to, direction: 'increasing'|'decreasing'|'flat', confidence }]
 * - warnings: ['NUMERIC_APPROXIMATION', ...]
 *
 * 禁止扫描无限定义域；只分析当前视口；最多 512 初始样本。
 */

export const MAX_INITIAL_SAMPLES = 512;
export const ANALYSIS_EVALUATION_BUDGET = 5000;

/** @param {string} warning @returns {{ ok: true, result: null, warning: string }} */
function warningResult(warning) {
  return { ok: true, result: null, warning };
}

/**
 * @param {{
 *   evaluate: (x: number) => number | null,
 *   xMin: number,
 *   xMax: number,
 *   samples?: number,
 *   budget?: number,
 *   tolerance?: number,
 * }} params
 * @returns {{ ok: boolean, result: any, warning?: string, evaluations?: number }}
 */
export function analyzeNumericFeatures(params) {
  const { evaluate, xMin, xMax } = params;
  if (typeof evaluate !== 'function') return warningResult('NO_EVALUATOR');
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || !(xMax > xMin)) {
    return warningResult('INVALID_INTERVAL');
  }
  const samples = Math.min(
    MAX_INITIAL_SAMPLES,
    Number.isInteger(params.samples) ? params.samples : 256,
  );
  const budget = Number.isInteger(params.budget) ? params.budget : ANALYSIS_EVALUATION_BUDGET;
  const tolerance = Number.isFinite(params.tolerance) ? params.tolerance : 1e-4;
  const warnings = ['NUMERIC_APPROXIMATION'];

  let evaluations = 0;
  const safeEval = (x) => {
    evaluations += 1;
    try {
      const y = evaluate(x);
      return y != null && Number.isFinite(y) ? y : null;
    } catch {
      return null;
    }
  };

  const step = (xMax - xMin) / samples;
  const xs = [];
  const ys = [];
  for (let i = 0; i <= samples; i += 1) {
    xs.push(xMin + i * step);
    ys.push(safeEval(xs[i]));
  }
  if (evaluations > budget) warnings.push('EVALUATION_BUDGET_EXCEEDED');

  const zeros = [];
  const extrema = [];
  const discontinuities = [];
  const monotonic = [];

  // 1) 符号变化 → 二分求根
  const bisect = (a, b, fa, fb) => {
    let lo = a;
    let hi = b;
    let flo = fa;
    let fhi = fb;
    for (let i = 0; i < 42; i += 1) {
      const mid = (lo + hi) / 2;
      const fm = safeEval(mid);
      if (fm == null) return null;
      if (Math.abs(fm) < tolerance || Math.abs(hi - lo) < 1e-12) return { x: mid, y: fm };
      if (flo * fm <= 0) {
        hi = mid;
        fhi = fm;
      } else {
        lo = mid;
        flo = fm;
      }
    }
    const x = (lo + hi) / 2;
    return { x, y: safeEval(x) };
  };

  for (let i = 0; i < samples; i += 1) {
    const ya = ys[i];
    const yb = ys[i + 1];
    if (ya == null || yb == null) {
      // 断点候选：非有限值
      const x = (xs[i] + xs[i + 1]) / 2;
      if (ys[i] == null || ys[i + 1] == null) {
        discontinuities.push({ x, kind: 'possible', confidence: 0.4 });
      }
      continue;
    }
    if (ya * yb <= 0) {
      const root = bisect(xs[i], xs[i + 1], ya, yb);
      if (root && root.y != null && Math.abs(root.y) < 0.05) {
        zeros.push({ x: root.x, residual: Math.abs(root.y), confidence: 0.9 });
      }
    }
  }

  // 2) 接近零但不变号 → 双重根候选：局部最小化 |f|
  for (let i = 1; i < samples - 1; i += 1) {
    const y = ys[i];
    if (y == null) continue;
    const absY = Math.abs(y);
    const prevAbs = ys[i - 1] == null ? Infinity : Math.abs(ys[i - 1]);
    const nextAbs = ys[i + 1] == null ? Infinity : Math.abs(ys[i + 1]);
    if (absY < 0.05 && absY <= prevAbs && absY <= nextAbs && prevAbs > 0 && nextAbs > 0) {
      zeros.push({ x: xs[i], residual: absY, confidence: 0.5 });
    }
  }

  // 3) 一阶差分 → 极值候选，局部细化
  for (let i = 1; i < samples - 1; i += 1) {
    const yPrev = ys[i - 1];
    const yCur = ys[i];
    const yNext = ys[i + 1];
    if (yPrev == null || yCur == null || yNext == null) continue;
    if (yCur < yPrev && yCur < yNext) {
      extrema.push({ x: xs[i], y: yCur, kind: 'min', confidence: 0.7 });
    } else if (yCur > yPrev && yCur > yNext) {
      extrema.push({ x: xs[i], y: yCur, kind: 'max', confidence: 0.7 });
    }
  }

  // 4) 单调区间：按相邻样本方向
  let runStart = xMin;
  let runDirection = null;
  for (let i = 0; i < samples; i += 1) {
    const y1 = ys[i];
    const y2 = ys[i + 1];
    if (y1 == null || y2 == null) {
      runDirection = null;
      continue;
    }
    const d = y2 - y1;
    const direction = d > tolerance ? 'increasing' : d < -tolerance ? 'decreasing' : 'flat';
    if (runDirection === null) {
      runDirection = direction;
      runStart = xs[i];
    } else if (direction !== runDirection) {
      monotonic.push({ from: runStart, to: xs[i], direction: runDirection, confidence: 0.6 });
      runStart = xs[i];
      runDirection = direction;
    }
  }
  if (runDirection !== null) {
    monotonic.push({ from: runStart, to: xMax, direction: runDirection, confidence: 0.6 });
  }

  // 5) 按容差去重
  const dedupe = (list, keyFn, tol) => {
    const out = [];
    for (const item of list) {
      if (out.some((existing) => Math.abs(keyFn(existing) - keyFn(item)) < tol)) continue;
      out.push(item);
    }
    return out;
  };
  const uniqueZeros = dedupe(zeros, (z) => z.x, Math.max(tolerance, 1e-3));
  const uniqueExtrema = dedupe(extrema, (e) => e.x, Math.max(tolerance, 1e-3));

  return {
    ok: true,
    result: {
      interval: [xMin, xMax],
      zeros: uniqueZeros,
      extrema: uniqueExtrema,
      discontinuities,
      monotonic,
      warnings,
    },
    evaluations,
  };
}
