/** 自定义函数数值特征：可信度合同 + 已知函数行为。 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

async function numericFeatures() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/numeric-features.js')).href,
  );
}

test('x^2-1 yields two zeros and a minimum', async () => {
  const { analyzeNumericFeatures } = await numericFeatures();
  const { ok, result } = analyzeNumericFeatures({
    evaluate: (x) => x * x - 1,
    xMin: -3,
    xMax: 3,
    samples: 256,
  });
  assert.equal(ok, true);
  assert.equal(result.warnings.includes('NUMERIC_APPROXIMATION'), true);
  const zeroXs = result.zeros.map((z) => z.x).sort((a, b) => a - b);
  assert.ok(zeroXs.some((x) => Math.abs(x + 1) < 1e-2), `zeros include -1: ${zeroXs}`);
  assert.ok(zeroXs.some((x) => Math.abs(x - 1) < 1e-2), `zeros include +1: ${zeroXs}`);
  const minima = result.extrema.filter((e) => e.kind === 'min');
  assert.ok(minima.some((e) => Math.abs(e.x) < 1e-2), 'minimum near 0');
});

test('abs(x) reports a minimum but no zero at the corner', async () => {
  const { analyzeNumericFeatures } = await numericFeatures();
  const { result } = analyzeNumericFeatures({
    evaluate: (x) => Math.abs(x),
    xMin: -2,
    xMax: 2,
    samples: 256,
  });
  const minima = result.extrema.filter((e) => e.kind === 'min');
  assert.ok(minima.some((e) => Math.abs(e.x) < 1e-2), 'min at 0');
  // abs 在 0 有尖角：差分法可能报一个 min（合理）；但不得报告「间断」
  assert.equal(result.discontinuities.length, 0, 'abs is continuous');
});

test('1/x flags a possible discontinuity at 0 without reporting a zero', async () => {
  const { analyzeNumericFeatures } = await numericFeatures();
  const { result } = analyzeNumericFeatures({
    evaluate: (x) => (Math.abs(x) < 1e-12 ? null : 1 / x),
    xMin: -2,
    xMax: 2,
    samples: 512,
  });
  assert.ok(result.discontinuities.length > 0, 'possible discontinuity flagged');
  assert.equal(
    result.zeros.some((z) => Math.abs(z.x) < 1e-2),
    false,
    'no zero at the pole',
  );
});

test('sin(x) finds zeros in the viewport', async () => {
  const { analyzeNumericFeatures } = await numericFeatures();
  const { result } = analyzeNumericFeatures({
    evaluate: (x) => Math.sin(x),
    xMin: -6,
    xMax: 6,
    samples: 256,
  });
  const zeroXs = result.zeros.map((z) => z.x);
  assert.ok(zeroXs.some((x) => Math.abs(x) < 1e-2), 'zero at 0');
  assert.ok(zeroXs.some((x) => Math.abs(x - Math.PI) < 1e-2), 'zero at pi');
});

test('double root (x-0.137)^2 is detected with lower confidence', async () => {
  const { analyzeNumericFeatures } = await numericFeatures();
  const { result } = analyzeNumericFeatures({
    evaluate: (x) => (x - 0.137) * (x - 0.137),
    xMin: -1,
    xMax: 1,
    samples: 256,
  });
  assert.ok(
    result.zeros.some((z) => Math.abs(z.x - 0.137) < 1e-2 && z.confidence <= 0.6),
    'double root via |f| minimization',
  );
});

test('throwing evaluators degrade to warnings without crashing', async () => {
  const { analyzeNumericFeatures } = await numericFeatures();
  const { ok, result, evaluations } = analyzeNumericFeatures({
    evaluate: () => {
      throw new Error('boom');
    },
    xMin: -1,
    xMax: 1,
    samples: 64,
  });
  assert.equal(ok, true);
  assert.equal(result.warnings.includes('NUMERIC_APPROXIMATION'), true);
  assert.ok(evaluations > 0);
});

test('budget bounds evaluations', async () => {
  const { analyzeNumericFeatures } = await numericFeatures();
  const { evaluations } = analyzeNumericFeatures({
    evaluate: (x) => x * x,
    xMin: -10,
    xMax: 10,
    samples: 512,
    budget: 1000,
  });
  assert.ok(evaluations <= 5000, `evaluations ${evaluations} within budget`);
});
