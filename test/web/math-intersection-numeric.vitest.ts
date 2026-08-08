import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

const modulePath = path.join(
  root,
  'apps/web/src/math/graph/construction/intersection-numeric.js',
);

test('numeric line-function intersection respects finite segment bounds', async () => {
  assert.equal(fs.existsSync(modulePath), true, 'numeric intersection module is required');
  const { findLineFnHitNumeric } = await import(pathToFileURL(modulePath).href);
  const point = (x, y) => ({ X: () => x, Y: () => y });
  const vertical = {
    elType: 'segment',
    point1: point(1, 0),
    point2: point(1, 2),
  };
  const host = {
    getBoard: () => ({ getBoundingBox: () => [-10, 10, 10, -10] }),
    evalFnY: (fn, x) => fn(x),
  };

  assert.deepEqual(
    findLineFnHitNumeric(host, vertical, () => 1, { forceFinite: true }),
    { x: 1, y: 1 },
  );
  assert.equal(
    findLineFnHitNumeric(host, vertical, () => 3, { forceFinite: true }),
    null,
  );
});

test('numeric line-function intersection finds a tangent contact', async () => {
  const { findLineFnHitNumeric } = await import(pathToFileURL(modulePath).href);
  const point = (x, y) => ({ X: () => x, Y: () => y });
  const horizontal = {
    elType: 'segment',
    point1: point(-2, 0),
    point2: point(2, 0),
  };
  const host = {
    getBoard: () => ({ getBoundingBox: () => [-3, 3, 3, -3] }),
    evalFnY: (fn, x) => fn(x),
  };

  const hit = findLineFnHitNumeric(
    host,
    horizontal,
    (x) => (x - 0.137) ** 2,
    { forceFinite: true },
  );

  assert.ok(hit);
  assert.ok(Math.abs(hit.x - 0.137) < 1e-5);
  assert.ok(Math.abs(hit.y) < 1e-8);
});
