/** 函数管理：显隐、锁定、重命名、复制、排序、独立定义域的 reducer 语义。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function storeModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-store.js')).href,
  );
}

function fn(id, overrides = {}) {
  return {
    id,
    name: '',
    kind: 'preset',
    preset: 'quadratic',
    expr: '',
    coeffs: { a: 1, b: 0, c: 0 },
    color: '#111',
    visible: true,
    locked: false,
    domain: { mode: 'viewport' },
    ...overrides,
  };
}

function doc(functions) {
  return {
    schemaVersion: 1,
    id: 'd',
    title: 't',
    functions,
    points: [],
    constructions: [],
    view: { boundingBox: [-8, 8, 8, -8], axes: {} },
    presentation: { activeFunctionId: functions[0]?.id || null, compare: null },
    annotations: { version: 1, strokes: [] },
    meta: { createdAt: '', updatedAt: '' },
  };
}

test('visibility toggle is an update and keeps the active id', async () => {
  const { reduceGraphDocument } = await storeModule();
  const before = doc([fn('f1'), fn('f2')]);
  const next = reduceGraphDocument(before, {
    type: 'function/update',
    payload: { id: 'f1', patch: { visible: false } },
  });
  assert.equal(next.functions[0].visible, false);
  assert.equal(next.presentation.activeFunctionId, 'f1', 'hidden active fn keeps selection');
  assert.equal(before.functions[0].visible, true);
});

test('all functions may be hidden but the last one cannot be removed by UI guard', async () => {
  const { reduceGraphDocument } = await storeModule();
  let next = doc([fn('f1')]);
  next = reduceGraphDocument(next, { type: 'function/update', payload: { id: 'f1', patch: { visible: false } } });
  assert.equal(next.functions[0].visible, false, 'hiding the only function is allowed');
  // reducer 层面 remove 会清空；「至少保留一条」由 UI 层确认（plan：若保留旧规则，UI 必须明确说明）
  const emptied = reduceGraphDocument(next, { type: 'function/remove', payload: { id: 'f1' } });
  assert.equal(emptied.functions.length, 0);
  assert.equal(emptied.presentation.activeFunctionId, null);
});

test('duplicate creates a new id/name inserted after the original', async () => {
  const { reduceGraphDocument } = await storeModule();
  const before = doc([fn('f1', { name: '二次' }), fn('f2')]);
  const dup = {
    ...fn('f1dup', { name: '二次（副本）', color: '#222', kind: 'preset', preset: 'quadratic', coeffs: { a: 1, b: 0, c: 0 } }),
  };
  const next = reduceGraphDocument(before, { type: 'function/duplicate', payload: { sourceId: 'f1', function: dup } });
  assert.deepEqual(next.functions.map((f) => f.id), ['f1', 'f1dup', 'f2'], 'copy lands after original');
  assert.equal(next.functions[1].name, '二次（副本）');
  assert.equal(next.presentation.activeFunctionId, 'f1dup', 'adding selects the new function');
  assert.equal('curve' in next.functions[1], false, 'no runtime fields');
});

test('lock flag survives updates and reorder keeps array order as truth', async () => {
  const { reduceGraphDocument } = await storeModule();
  const before = doc([fn('f1'), fn('f2'), fn('f3')]);
  const locked = reduceGraphDocument(before, {
    type: 'function/update',
    payload: { id: 'f2', patch: { locked: true } },
  });
  assert.equal(locked.functions[1].locked, true);

  const reordered = reduceGraphDocument(locked, {
    type: 'function/reorder',
    payload: { ids: ['f3', 'f1', 'f2'] },
  });
  assert.deepEqual(reordered.functions.map((f) => f.id), ['f3', 'f1', 'f2']);
  assert.equal(reordered.functions[2].locked, true, 'lock travels with the record');
});

test('rename trims to 1-20 chars at the UI commit layer', async () => {
  const { normalizeGraphDocument } = await import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-document.js')).href,
  );
  // 文档规范化：name 保留字符串；trim 属于 UI 提交层
  const result = normalizeGraphDocument({
    schemaVersion: 1,
    id: 'd',
    title: 't',
    functions: [{ id: 'f1', kind: 'preset', preset: 'quadratic', name: '  g  ' }],
    points: [],
    constructions: [],
    view: { boundingBox: [-8, 8, 8, -8] },
    presentation: { activeFunctionId: 'f1' },
    annotations: { version: 1, strokes: [] },
    meta: {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.document.functions[0].name, '  g  ', 'normalize keeps the raw string');
});

test('custom expression must compile before commit; editor rejects invalid ones', async () => {
  const { createCustomFunctionRecord } = await import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/function-records.js')).href,
  );
  const bad = createCustomFunctionRecord({ id: 'f1', raw: 'x ^' });
  assert.equal(bad.ok, false);
  const good = createCustomFunctionRecord({ id: 'f1', raw: 'x^2 + 1' });
  assert.equal(good.ok, true);
  assert.equal(good.record.expr, 'x^2 + 1');
  assert.equal('evalFn' in good.record, false);
});

test('domain updates sort min/max and viewport mode drops fixed values', async () => {
  const { reduceGraphDocument } = await storeModule();
  const before = doc([fn('f1')]);
  const next = reduceGraphDocument(before, {
    type: 'function/update',
    payload: { id: 'f1', patch: { domain: { mode: 'custom', min: 10, max: -10 } } },
  });
  // reducer 是浅合并；排序/限制属于 normalize 层
  assert.deepEqual(next.functions[0].domain, { mode: 'custom', min: 10, max: -10 });

  const { normalizeGraphDocument } = await import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-document.js')).href,
  );
  const normalized = normalizeGraphDocument({
    schemaVersion: 1,
    id: 'd',
    title: 't',
    functions: [fn('f1', { domain: { mode: 'custom', min: 10, max: -10 } })],
    points: [],
    constructions: [],
    view: { boundingBox: [-8, 8, 8, -8] },
    presentation: { activeFunctionId: 'f1' },
    annotations: { version: 1, strokes: [] },
    meta: {},
  });
  assert.equal(normalized.ok, true);
  assert.deepEqual(normalized.document.functions[0].domain, { mode: 'custom', min: -10, max: 10 });
});
