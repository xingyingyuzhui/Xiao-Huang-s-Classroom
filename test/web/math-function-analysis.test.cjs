const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function analysis() {
  return import(
    pathToFileURL(
      path.join(root, 'apps/web/src/math/graph/function-analysis.js'),
    ).href
  );
}

test('graph function analysis evaluates visible preset and custom records', async () => {
  const { evaluateGraphFunction } = await analysis();
  const preset = {
    kind: 'preset',
    preset: 'linear',
    coeffs: { a: 2, b: 1, c: 0 },
    visible: true,
  };
  const custom = {
    kind: 'custom',
    evalFn: (x) => x * x,
    visible: true,
  };

  assert.equal(evaluateGraphFunction(preset, 3), 7);
  assert.equal(evaluateGraphFunction(custom, 3), 9);
  preset.visible = false;
  assert.equal(evaluateGraphFunction(preset, 3), null);
});

test('function intersection analysis detects a tangent intersection near the pointer', async () => {
  const { findFunctionIntersectionNear } = await analysis();
  const functions = [
    { id: 'a', kind: 'custom', evalFn: (x) => (x - 0.137) ** 2, visible: true },
    { id: 'b', kind: 'custom', evalFn: () => 0, visible: true },
  ];

  const hit = findFunctionIntersectionNear(functions, 0, 0, 0.2);

  assert.ok(hit);
  assert.equal(hit.fnA.id, 'a');
  assert.equal(hit.fnB.id, 'b');
  assert.ok(Math.abs(hit.x - 0.137) < 1e-5);
});

