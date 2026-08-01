const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function records() {
  return import(
    pathToFileURL(
      path.join(root, 'apps/web/src/math/graph/function-records.js'),
    ).href
  );
}

test('preset function record normalizes unknown presets and coefficients', async () => {
  const { createPresetFunctionRecord } = await records();
  const record = createPresetFunctionRecord({
    id: 'f9',
    color: '#123456',
    preset: 'unknown',
    coeffs: { a: '4', b: Infinity },
  });

  assert.equal(record.id, 'f9');
  assert.equal(record.preset, 'quadratic');
  assert.deepEqual(record.coeffs, { a: 4, b: -1, c: -1.5 });
  assert.equal(record.visible, true);
});

test('custom function record returns validation errors without a partial record', async () => {
  const { createCustomFunctionRecord } = await records();
  const invalid = createCustomFunctionRecord({ id: 'f1', color: '#000', raw: 'x +' });
  const valid = createCustomFunctionRecord({ id: 'f2', color: '#111', raw: 'x^2' });

  assert.equal(invalid.ok, false);
  assert.equal(invalid.record, null);
  assert.equal(valid.ok, true);
  assert.equal(valid.record.expr, 'x^2');
  assert.equal(valid.record.evalFn(3), 9);
});
