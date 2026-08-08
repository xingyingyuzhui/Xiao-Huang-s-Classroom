/** 函数变换：结构化说明 + 参数插值规则。 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

async function transformModel() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/transform-model.js')).href,
  );
}

test('quadratic vertical scale and shifts are described structurally', async () => {
  const { describePresetTransform } = await transformModel();
  const changes = describePresetTransform('quadratic', { a: 1, b: 0, c: 0 }, { a: 2, b: 1, c: -3 });
  assert.deepEqual(
    changes.map((c) => c.kind),
    ['verticalScale', 'horizontalShift', 'verticalShift'],
  );
  assert.equal(changes[0].text, '纵向伸缩为 2 倍');
  assert.match(changes[1].text, /右移/);
  assert.match(changes[2].text, /下移/);
});

test('negative scale describes flip', async () => {
  const { describePresetTransform } = await transformModel();
  const changes = describePresetTransform('quadratic', { a: 1, b: 0, c: 0 }, { a: -1, b: 0, c: 0 });
  assert.match(changes[0].text, /翻折/);
});

test('sine amplitude and phase changes are described', async () => {
  const { describePresetTransform } = await transformModel();
  const changes = describePresetTransform('sine', { a: 1, b: 1, c: 0 }, { a: 3, b: 2, c: 0.5 });
  assert.deepEqual(
    changes.map((c) => c.kind),
    ['amplitude', 'angularFrequency', 'phase'],
  );
});

test('unexplainable changes fall back to a plain params entry', async () => {
  const { describePresetTransform } = await transformModel();
  const changes = describePresetTransform('inverse', { a: 1, b: 0, c: 0 }, { a: 1, b: 0, c: 0 });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, 'params');
  assert.equal(changes[0].text, '参数变化');
});

test('power index interpolation is discrete while coefficients are linear', async () => {
  const { interpolateCoeffs } = await transformModel();
  const atHalf = interpolateCoeffs('power', { a: 1, b: 1, c: 0 }, { a: 3, b: 3, c: 0 }, 0.5);
  assert.equal(atHalf.a, 2, 'coefficient interpolates linearly');
  assert.equal(atHalf.b, 2, 'exponent steps discretely through integers');
  const atQuarter = interpolateCoeffs('power', { a: 1, b: 1, c: 0 }, { a: 3, b: 3, c: 0 }, 0.25);
  assert.equal(atQuarter.b, 2, 'half-round keeps integer exponent (no fractional 1.5)');
  const clamped = interpolateCoeffs('power', { a: 1, b: 1, c: 0 }, { a: 3, b: 3, c: 0 }, 2);
  assert.equal(clamped.a, 3, 't clamped to 1');
});

test('sine coefficients interpolate linearly', async () => {
  const { interpolateCoeffs } = await transformModel();
  const at = interpolateCoeffs('sine', { a: 0, b: 0, c: 0 }, { a: 2, b: 4, c: 6 }, 0.5);
  assert.deepEqual(at, { a: 1, b: 2, c: 3 });
});
