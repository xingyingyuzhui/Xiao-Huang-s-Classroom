/** GraphDocumentV2：默认文档、规范化、校验与序列化契约。 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

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

test('default document is schema v2 with one quadratic function', async () => {
  const { createDefaultGraphDocument, GRAPH_DOCUMENT_VERSION } = await docModule();
  const doc = createDefaultGraphDocument({ now: () => '2026-08-02T00:00:00.000Z' });

  assert.equal(GRAPH_DOCUMENT_VERSION, 2);
  assert.equal(doc.schemaVersion, 2);
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
    schemaVersion: 2,
    id: 'doc-1',
    title: 't',
    functions: [
      {
        id: 'f1',
        kind: 'custom',
        expr: 'x^2',
        colorSlot: 1,
        explicitColor: null,
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
    schemaVersion: 2,
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
    schemaVersion: 2,
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
    schemaVersion: 2,
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
    schemaVersion: 2,
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
    schemaVersion: 2,
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
    schemaVersion: 2,
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
  assert.equal(serializable.schemaVersion, 2);
});

test('hydrate recompiles custom expressions and fails the whole import on invalid ones', async () => {
  const { hydrateGraphDocument } = await docModule();
  const ok = hydrateGraphDocument({
    schemaVersion: 2,
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
    schemaVersion: 2,
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
  const bad = validateGraphDocument({ schemaVersion: 2, functions: 'nope' });
  assert.equal(bad.ok, false);
});

test('point constraints normalize from legacy follow ids and intersect pairs', async () => {
  const { normalizeGraphDocument, pointConstraintFromLegacy } = await docModule();

  const legacyCurve = pointConstraintFromLegacy('graph:fn:f1', null, { x: 2 });
  assert.deepEqual(legacyCurve, { kind: 'followFunction', functionId: 'f1', anchorX: 2 });

  const legacyFeature = pointConstraintFromLegacy('graph:fn:f1:feature:vertex', null, { x: 1 });
  assert.deepEqual(legacyFeature, { kind: 'followFeature', functionId: 'f1', feature: 'vertex', featureIndex: 0 });

  const legacyIx = pointConstraintFromLegacy(null, ['f1', 'f2'], { x: 0.5 });
  assert.deepEqual(legacyIx, { kind: 'intersection', targetIds: ['f1', 'f2'], nearX: 0.5 });

  const free = pointConstraintFromLegacy(null, null);
  assert.deepEqual(free, { kind: 'free' });

  const doc = normalizeGraphDocument({
    schemaVersion: 2,
    id: 'd',
    title: 't',
    functions: [
      { id: 'f1', kind: 'preset', preset: 'quadratic' },
      { id: 'f2', kind: 'preset', preset: 'linear' },
    ],
    points: [
      { id: 'p1', name: 'A', x: 1, y: 2, constraint: { kind: 'followFunction', functionId: 'f1', anchorX: 1 } },
      { id: 'p2', name: 'B', x: 3, y: 4, constraint: { kind: 'followFeature', functionId: 'f1', feature: 'vertex', featureIndex: 0 } },
      { id: 'p3', name: 'C', x: 0, y: 0, constraint: { kind: 'intersection', targetIds: ['f1', 'f2'], nearX: 0 } },
      { id: 'p4', name: 'D', x: 5, y: 6, constraint: { kind: 'bogus' } },
    ],
    points2: [],
    constructions: [],
    view: { boundingBox: [-8, 8, 8, -8] },
    presentation: { activeFunctionId: 'f1' },
    annotations: { version: 1, strokes: [] },
    meta: {},
  });
  assert.equal(doc.ok, true);
  const points = doc.document.points;
  assert.deepEqual(points[0].constraint, { kind: 'followFunction', functionId: 'f1', anchorX: 1 });
  assert.deepEqual(points[1].constraint, { kind: 'followFeature', functionId: 'f1', feature: 'vertex', featureIndex: 0 });
  assert.deepEqual(points[2].constraint, { kind: 'intersection', targetIds: ['f1', 'f2'], nearX: 0 });
  assert.deepEqual(points[3].constraint, { kind: 'free' }, 'unknown constraint kinds fall back to free');
  // 样式默认结构
  assert.equal(points[0].style.stroke.colorSlot, null);
  assert.equal(points[0].style.fill.opacity, 1);
  assert.equal(points[0].style.size, 3);
  // 交点目标必须存在：缺目标 → 整个文档被引用校验拒绝
  const dangling = normalizeGraphDocument({
    schemaVersion: 2,
    id: 'd',
    title: 't',
    functions: [{ id: 'f1', kind: 'preset', preset: 'quadratic' }],
    points: [{ id: 'p3', x: 0, y: 0, constraint: { kind: 'intersection', targetIds: ['f1', 'f2'], nearX: 0 } }],
    constructions: [],
    view: { boundingBox: [-8, 8, 8, -8] },
    presentation: { activeFunctionId: 'f1' },
    annotations: { version: 1, strokes: [] },
    meta: {},
  });
  assert.equal(dangling.ok, false);
  assert.equal(dangling.code, 'INVALID_REFERENCE');
});

test('point style round-trips through legacy mapping', async () => {
  const { pointStyleFromLegacy, normalizeGraphDocument } = await docModule();
  const legacy = {
    strokeColor: '#ff0000',
    strokeWidth: 2,
    fillColor: '#00ff00',
    fillOpacity: 0.5,
    size: 5,
    fontSize: 16,
  };
  const style = pointStyleFromLegacy(legacy);
  assert.equal(style.stroke.explicitColor, '#ff0000');
  assert.equal(style.fill.explicitColor, '#00ff00');
  assert.equal(style.fill.opacity, 0.5);
  assert.equal(style.size, 5);
  assert.equal(style.label.fontSize, 16);

  const result = normalizeGraphDocument({
    schemaVersion: 2,
    id: 'd',
    title: 't',
    functions: [{ id: 'f1', kind: 'preset', preset: 'quadratic' }],
    points: [{ id: 'p1', style: { stroke: { explicitColor: '#123456' }, size: 7 } }],
    constructions: [],
    view: { boundingBox: [-8, 8, 8, -8] },
    presentation: { activeFunctionId: 'f1' },
    annotations: { version: 1, strokes: [] },
    meta: {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.document.points[0].style.stroke.explicitColor, '#123456');
  assert.equal(result.document.points[0].style.size, 7);
});

test('global invariants: empty functions, cross-type ids, cycles are rejected', async () => {
  const { normalizeGraphDocument } = await docModule();
  const base = {
    id: 'd',
    title: 't',
    points: [],
    constructions: [],
    view: { boundingBox: [-8, 8, 8, -8] },
    presentation: {},
    annotations: { version: 1, strokes: [] },
    meta: {},
  };

  // functions 为空
  const empty = normalizeGraphDocument({ ...base, schemaVersion: 2, functions: [] });
  assert.equal(empty.ok, false);
  assert.equal(empty.code, 'INVALID_DOCUMENT');

  // 跨类型 id 重复：函数与点同名
  const dup = normalizeGraphDocument({
    ...base,
    schemaVersion: 2,
    functions: [{ id: 'x1', kind: 'preset', preset: 'quadratic' }],
    points: [{ id: 'x1', x: 0, y: 0 }],
  });
  assert.equal(dup.ok, false);
  assert.equal(dup.code, 'INVALID_DOCUMENT');

  // 未知 point constraint kind 回落 free（不拒绝）；未知 construction kind 拒绝
  const badKind = normalizeGraphDocument({
    ...base,
    schemaVersion: 2,
    functions: [{ id: 'f1', kind: 'preset', preset: 'quadratic' }],
    constructions: [{ id: 'c1', kind: 'warp-drive' }],
  });
  assert.equal(badKind.ok, false);

  // 引用环：构造互相依赖
  const cyclic = normalizeGraphDocument({
    ...base,
    schemaVersion: 2,
    functions: [{ id: 'f1', kind: 'preset', preset: 'quadratic' }],
    constructions: [
      { id: 'c1', kind: 'perp', pointIds: [], targetConstrId: 'c2' },
      { id: 'c2', kind: 'perp', pointIds: [], targetConstrId: 'c1' },
    ],
  });
  assert.equal(cyclic.ok, false);
  assert.equal(cyclic.code, 'INVALID_REFERENCE');

  // custom domain 反序 → 规范化递增
  const reversed = normalizeGraphDocument({
    ...base,
    schemaVersion: 2,
    functions: [
      { id: 'f1', kind: 'preset', preset: 'quadratic', domain: { mode: 'custom', min: 5, max: -3 } },
    ],
  });
  assert.equal(reversed.ok, true);
  assert.deepEqual(reversed.document.functions[0].domain, { mode: 'custom', min: -3, max: 5 });
});

test('V1 literal color normalizes to colorSlot by position without runtime theme color', async () => {
  const { normalizeGraphDocument } = await docModule();
  const result = normalizeGraphDocument({
    schemaVersion: 2,
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
  });
  assert.equal(result.ok, true);
  const fns = result.document.functions;
  assert.equal('color' in fns[0], false);
  assert.equal(fns[0].colorSlot, 0);
  assert.equal(fns[1].colorSlot, 1);
  assert.equal(fns[0].explicitColor, null);
});
