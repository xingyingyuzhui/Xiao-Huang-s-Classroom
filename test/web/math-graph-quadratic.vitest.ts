/**
 * 二次函数纯几何量契约（live graph/model）
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import root from '../helpers/repo-root.js';

async function load(rel) {
  return import(pathToFileURL(path.join(root, rel)).href);
}

test('quadratic helpers: vertex, discriminant, roots, monotonic', async () => {
  const { vertex, discriminant, roots, monotonicIntervals, coeffsFromVertex } = await load(
    'apps/web/src/math/graph/model.js',
  );

  const v = vertex(1, -2, 0);
  assert.ok(v);
  assert.ok(Math.abs(v.h - 1) < 1e-9);
  assert.ok(Math.abs(v.k - -1) < 1e-9);
  assert.equal(discriminant(1, -2, 0), 4);
  assert.deepEqual(
    roots(1, -2, 0).map((x) => Number(x.toFixed(6))),
    [0, 2],
  );
  const mono = monotonicIntervals(1, -2);
  assert.ok(mono.decreasing[0].includes('1'));
  assert.ok(mono.increasing[0].includes('1'));

  const c = coeffsFromVertex(2, 1, 3);
  assert.equal(c.a, 2);
  assert.equal(c.b, -4);
  assert.equal(c.c, 5);
});

test('quadratic keyFeatures uses shared helpers', async () => {
  const { keyFeatures, defaultCoeffsFor } = await load('apps/web/src/math/graph/model.js');
  const feats = keyFeatures('quadratic', { a: 1, b: -2, c: 0 });
  assert.ok(feats.some((f) => f.kind === '顶点' && /顶点/.test(f.text)));
  assert.ok(feats.some((f) => f.kind === '判别式' && /4/.test(f.text)));
  assert.ok(feats.some((f) => f.kind === '零点'));
  const def = defaultCoeffsFor('quadratic');
  assert.ok(def.a != null);
});
