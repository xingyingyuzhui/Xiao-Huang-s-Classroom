/** GraphDocumentV1：默认文档、规范化、校验与序列化契约。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function docModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-document.js')).href,
  );
}

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

test('default document is schema v1 with one quadratic function', async () => {
  const { createDefaultGraphDocument, GRAPH_DOCUMENT_VERSION } = await docModule();
  const doc = createDefaultGraphDocument({ now: () => '2026-08-02T00:00:00.000Z' });

  assert.equal(GRAPH_DOCUMENT_VERSION, 1);
  assert.equal(doc.schemaVersion, 1);
  assert.equal(typeof doc.id, 'string');
  assert.equal(typeof doc.title, 'string');
  assert.equal(doc.functions.length, 1);
  assert.equal(doc.functions[0].kind, 'preset');
  assert.equal(doc.functions[0].preset, 'quadratic');
  assert.equal(doc.functions[0].visible, true);
  assert.deepEqual(doc.points, []);
  assert.deepEqual(doc.constructions, []);
  assert.deepEqual(doc.view.boundingBox, [-8, 8, 8, -8]);
  assert.equal(doc.presentation.activeFunctionId, doc.functions[0].id);
  assert.deepEqual(doc.annotations, { version: 1, strokes: [] });
  assert.equal(doc.meta.createdAt, '2026-08-02T00:00:00.000Z');
  // 默认文档不能携带 runtime 字段
  assert.equal('curve' in doc.functions[0], false);
  assert.equal('evalFn' in doc.functions[0], false);
});

test('normalize removes runtime fields and canonicalizes records', async () => {
  const { normalizeGraphDocument } = await docModule();
  const input = {
    schemaVersion: 1,
    id: 'doc-1',
    title: 't',
    functions: [
      {
        id: 'f1',
        kind: 'custom',
        expr: 'x^2',
        color: '#ff0000',
        curve: { some: 'jsxgraph' },
        evalFn: () => 0,
        el: null,
        junk: 'dropped',
      },
    ],
    points: [{ id: 'p1', el: {}, hiddenRuntime: true }],
    constructions: [{ id: 'c1', kind: 'segment', els: [] }],
    view: { boundingBox: [-10, 10, 10, -10], axes: { grid: true } },
    presentation: { activeFunctionId: 'f1', compare: null },
    annotations: { version: 1, strokes: [] },
    meta: { createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
  };
  const normalized = normalizeGraphDocument(input);
  assert.equal(normalized.ok, true);
  const doc = normalized.document;
  const fn = doc.functions[0];

  assert.equal('curve' in fn, false);
  assert.equal('evalFn' in fn, false);
  assert.equal('el' in fn, false);
  assert.equal('junk' in fn, false);
  assert.equal(fn.kind, 'custom');
  assert.equal(fn.expr, 'x^2');
  assert.equal(fn.visible, true);
  assert.equal('el' in doc.points[0], false);
  assert.equal('els' in doc.constructions[0], false);
  assert.equal('hiddenRuntime' in doc.points[0], false);
});

test('normalize clamps non-finite coefficients to defaults', async () => {
  const { normalizeGraphDocument } = await docModule();
  const result = normalizeGraphDocument({
    schemaVersion: 1,
    id: 'd',
    title: 't',
    functions: [
      { id: 'f1', kind: 'preset', preset: 'quadratic', coeffs: { a: Infinity, b: NaN, c: 3 } },
    ],
    points: [],
    constructions: [],
    view: { boundingBox: [-8, 8, 8, -8] },
    presentation: { activeFunctionId: 'f1' },
    annotations: { version: 1, strokes: [] },
    meta: {},
  });
  assert.equal(result.ok, true);
  const doc = result.document;
  // 非有限系数回落该预设的真实默认值（quadratic: a=0.5, b=-1, c=-1.5）
  assert.equal(doc.functions[0].coeffs.a, 0.5);
  assert.equal(doc.functions[0].coeffs.b, -1);
  assert.equal(doc.functions[0].coeffs.c, 3);
});

test('normalize sorts and clamps function domain', async () => {
  const { normalizeGraphDocument } = await docModule();
  const withReversed = normalizeGraphDocument({
    schemaVersion: 1,
    id: 'd',
    title: 't',
    functions: [
      {
        id: 'f1',
        kind: 'preset',
        preset: 'quadratic',
        domain: { mode: 'custom', min: 10, max: -10 },
      },
      {
        id: 'f2',
        kind: 'preset',
        preset: 'quadratic',
        domain: { mode: 'custom', min: -2e9, max: 2e9 },
      },
    ],
    points: [],
    constructions: [],
    view: { boundingBox: [-8, 8, 8, -8] },
    presentation: { activeFunctionId: null },
    annotations: { version: 1, strokes: [] },
    meta: {},
  });
  assert.equal(withReversed.ok, true);
  const [f1, f2] = withReversed.document.functions;
  assert.equal(f1.domain.min, -10);
  assert.equal(f1.domain.max, 10);
  assert.equal(f2.domain.min, -1e6);
  assert.equal(f2.domain.max, 1e6);
});

test('normalize rejects duplicate ids instead of silently overwriting', async () => {
  const { normalizeGraphDocument } = await docModule();
  const result = normalizeGraphDocument({
    schemaVersion: 1,
    id: 'd',
    title: 't',
    functions: [
      { id: 'f1', kind: 'preset', preset: 'quadratic' },
      { id: 'f1', kind: 'preset', preset: 'linear' },
    ],
    points: [],
    constructions: [],
    view: { boundingBox: [-8, 8, 8, -8] },
    presentation: { activeFunctionId: null },
    annotations: { version: 1, strokes: [] },
    meta: {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_DOCUMENT');
  assert.match(result.path || '', /functions/);
});

test('normalize fails cleanly on invalid custom expression', async () => {
  const { normalizeGraphDocument } = await docModule();
  const result = normalizeGraphDocument({
    schemaVersion: 1,
    id: 'd',
    title: 't',
    functions: [{ id: 'f1', kind: 'custom', expr: 'x + (' }],
    points: [],
    constructions: [],
    view: { boundingBox: [-8, 8, 8, -8] },
    presentation: { activeFunctionId: null },
    annotations: { version: 1, strokes: [] },
    meta: {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_EXPRESSION');
  assert.match(result.path || '', /functions\[0\]/);
});

test('normalize never mutates the input', async () => {
  const { normalizeGraphDocument } = await docModule();
  const input = {
    schemaVersion: 1,
    id: 'd',
    title: 't',
    functions: [
      { id: 'f1', kind: 'preset', preset: 'quadratic', curve: { x: 1 }, coeffs: { a: 2 } },
    ],
    points: [],
    constructions: [],
    view: { boundingBox: [-8, 8, 8, -8] },
    presentation: { activeFunctionId: null },
    annotations: { version: 1, strokes: [] },
    meta: {},
  };
  freezeDeep(input);
  const normalized = normalizeGraphDocument(input);
  assert.equal(normalized.ok, true);
  assert.equal('curve' in input.functions[0], true, 'input must stay untouched');
  assert.equal(input.functions[0].coeffs.a, 2);
});

test('unknown schema version fails with a clear error', async () => {
  const { normalizeGraphDocument } = await docModule();
  const result = normalizeGraphDocument({
    schemaVersion: 99,
    id: 'd',
    title: 't',
    functions: [],
    points: [],
    constructions: [],
    view: {},
    presentation: {},
    annotations: {},
    meta: {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNSUPPORTED_VERSION');
});

test('toSerializable document JSON-stringifies without runtime fields', async () => {
  const { normalizeGraphDocument, toSerializableGraphDocument } = await docModule();
  const normalized = normalizeGraphDocument({
    schemaVersion: 1,
    id: 'd',
    title: 't',
    functions: [
      {
        id: 'f1',
        kind: 'custom',
        expr: 'x^2',
        curve: { board: {} },
        evalFn: () => 1,
      },
    ],
    points: [],
    constructions: [],
    view: { boundingBox: [-8, 8, 8, -8] },
    presentation: { activeFunctionId: 'f1' },
    annotations: { version: 1, strokes: [] },
    meta: { createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
  });
  const serializable = toSerializableGraphDocument(normalized.document);
  const json = JSON.stringify(serializable);
  assert.doesNotThrow(() => JSON.parse(json));
  assert.equal('curve' in serializable.functions[0], false);
  assert.equal('evalFn' in serializable.functions[0], false);
  assert.equal(serializable.schemaVersion, 1);
});

test('hydrate recompiles custom expressions and fails the whole import on invalid ones', async () => {
  const { hydrateGraphDocument } = await docModule();
  const ok = hydrateGraphDocument({
    schemaVersion: 1,
    id: 'd',
    title: 't',
    functions: [
      { id: 'f1', kind: 'custom', expr: 'x^2' },
      { id: 'f2', kind: 'preset', preset: 'linear', coeffs: { a: 2, b: 1, c: 0 } },
    ],
    points: [],
    constructions: [],
    view: { boundingBox: [-8, 8, 8, -8] },
    presentation: { activeFunctionId: 'f1' },
    annotations: { version: 1, strokes: [] },
    meta: {},
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.document.functions.length, 2);

  const bad = hydrateGraphDocument({
    schemaVersion: 1,
    id: 'd',
    title: 't',
    functions: [{ id: 'f1', kind: 'custom', expr: 'x ^' }],
    points: [],
    constructions: [],
    view: { boundingBox: [-8, 8, 8, -8] },
    presentation: { activeFunctionId: null },
    annotations: { version: 1, strokes: [] },
    meta: {},
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'INVALID_EXPRESSION');
});

test('validateGraphDocument reports validity', async () => {
  const { createDefaultGraphDocument, validateGraphDocument } = await docModule();
  const ok = validateGraphDocument(createDefaultGraphDocument({}));
  assert.equal(ok.ok, true);
  const bad = validateGraphDocument({ schemaVersion: 1, functions: 'nope' });
  assert.equal(bad.ok, false);
});
