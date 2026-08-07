/** GraphDocument 版本迁移：V1 直通、legacy 快照迁移、未知版本拒绝。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function migrations() {
  return import(
    pathToFileURL(
      path.join(root, 'apps/web/src/math/graph/graph-document-migrations.js'),
    ).href,
  );
}

test('migrate converts a v1 document to v2 and drops literal color', async () => {
  const { migrateGraphDocument } = await migrations();
  const doc = {
    schemaVersion: 1,
    id: 'd',
    title: 't',
    functions: [
      { id: 'f1', kind: 'preset', preset: 'quadratic', color: '#b45309' },
      { id: 'f2', kind: 'preset', preset: 'linear', color: '#0f766e' },
    ],
    points: [],
    constructions: [],
    view: { boundingBox: [-8, 8, 8, -8] },
    presentation: { activeFunctionId: 'f1' },
    annotations: { version: 1, strokes: [] },
    meta: {},
  };
  const result = migrateGraphDocument(doc);
  assert.equal(result.ok, true);
  assert.equal(result.document.schemaVersion, 2);
  assert.equal('color' in result.document.functions[0], false);
  assert.equal(result.document.functions[0].colorSlot, 0);
  assert.equal(result.document.functions[1].colorSlot, 1);
  assert.equal(result.document.functions[0].explicitColor, null);
});

test('migrate passes a v2 document through unchanged', async () => {
  const { migrateGraphDocument } = await migrations();
  const doc = {
    schemaVersion: 2,
    id: 'd',
    title: 't',
    functions: [{ id: 'f1', kind: 'preset', preset: 'quadratic', colorSlot: 0, explicitColor: null }],
    points: [],
    constructions: [],
    view: { boundingBox: [-8, 8, 8, -8] },
    presentation: { activeFunctionId: 'f1' },
    annotations: { version: 1, strokes: [] },
    meta: {},
  };
  const result = migrateGraphDocument(doc);
  assert.equal(result.ok, true);
  assert.equal(result.document, doc);
});

test('migrate converts the legacy single-preset snapshot shape', async () => {
  const { migrateGraphDocument } = await migrations();
  // 本项目真实存在的旧形态：graph lab-bridge 快照的 params 部分
  const legacy = {
    params: { preset: 'quadratic', coeffs: { a: 1, b: -2, c: 1 } },
  };
  const result = migrateGraphDocument(legacy);
  assert.equal(result.ok, true);
  assert.equal(result.document.schemaVersion, 2);
  assert.equal(result.document.functions.length, 1);
  assert.equal(result.document.functions[0].kind, 'preset');
  assert.equal(result.document.functions[0].preset, 'quadratic');
  assert.deepEqual(result.document.functions[0].coeffs, { a: 1, b: -2, c: 1 });
  assert.equal(result.document.functions[0].colorSlot, 0);
});

test('migrate converts a legacy functions array and drops runtime fields', async () => {
  const { migrateGraphDocument } = await migrations();
  const legacy = {
    functions: [
      {
        id: 'f1',
        kind: 'custom',
        expr: 'x^2',
        color: '#ff0000',
        visible: true,
        curve: { board: {} },
        evalFn: () => 0,
      },
    ],
    preset: 'quadratic',
    coeffs: { a: 1, b: 0, c: 0 },
  };
  const result = migrateGraphDocument(legacy);
  assert.equal(result.ok, true);
  const fn = result.document.functions[0];
  assert.equal(fn.kind, 'custom');
  assert.equal(fn.expr, 'x^2');
  assert.equal('curve' in fn, false);
  assert.equal('evalFn' in fn, false);
});

test('migrate rejects unknown versions and non-object input', async () => {
  const { migrateGraphDocument } = await migrations();
  const tooNew = migrateGraphDocument({ schemaVersion: 99, functions: [] });
  assert.equal(tooNew.ok, false);
  assert.equal(tooNew.code, 'UNSUPPORTED_VERSION');

  const notObject = migrateGraphDocument('hello');
  assert.equal(notObject.ok, false);
  assert.equal(notObject.code, 'INVALID_DOCUMENT');

  const nullInput = migrateGraphDocument(null);
  assert.equal(nullInput.ok, false);
});
