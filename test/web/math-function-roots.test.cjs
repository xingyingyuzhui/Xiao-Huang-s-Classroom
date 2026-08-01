const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function roots() {
  return import(
    pathToFileURL(
      path.join(
        root,
        'apps/web/src/math/graph/construction/function-roots.js',
      ),
    ).href
  );
}

test('findRootNear returns the crossing root nearest the requested center', async () => {
  const { findRootNear } = await roots();
  const rootX = findRootNear((x) => x * x - 1, 0.8, 3);
  assert.ok(Math.abs(rootX - 1) < 1e-6);
});

test('findRootNear detects an even-multiplicity tangent root', async () => {
  const { findRootNear } = await roots();
  const rootX = findRootNear((x) => (x - 0.137) ** 2, 0, 1);
  assert.ok(Math.abs(rootX - 0.137) < 1e-5);
});

test('findRootNear does not report a discontinuity as a root', async () => {
  const { findRootNear } = await roots();
  const rootX = findRootNear((x) => 1 / (x - 0.137), 0, 1);
  assert.equal(rootX, null);
});

