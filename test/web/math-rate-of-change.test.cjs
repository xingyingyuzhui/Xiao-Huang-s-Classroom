/** 割线与平均变化率：纯数学 + 文档记录往返。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function rateModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/rate-of-change.js')).href,
  );
}

test('secantMetrics computes linear slope exactly', async () => {
  const { secantMetrics } = await rateModule();
  const result = secantMetrics((x) => 2 * x + 1, 0, 3);
  assert.equal(result.valid, true);
  assert.equal(result.slope, 2);
  assert.equal(result.dx, 3);
  assert.equal(result.dy, 6);
  assert.deepEqual(result.p1, { x: 0, y: 1 });
  assert.deepEqual(result.p2, { x: 3, y: 7 });
  assert.deepEqual(result.midpoint, { x: 1.5, y: 4 });
});

test('secantMetrics handles quadratic and midpoint', async () => {
  const { secantMetrics } = await rateModule();
  const result = secantMetrics((x) => x * x, 1, 3);
  assert.equal(result.valid, true);
  assert.equal(result.slope, 4, '(9-1)/(3-1)');
  assert.deepEqual(result.midpoint, { x: 2, y: 5 });
});

test('secantMetrics rejects identical and near-identical x', async () => {
  const { secantMetrics } = await rateModule();
  const same = secantMetrics((x) => x, 2, 2);
  assert.equal(same.valid, false);
  const near = secantMetrics((x) => x, 1, 1 + 1e-12);
  assert.equal(near.valid, false, 'epsilon rejection');
});

test('secantMetrics reports invalid on out-of-domain and infinity without throwing', async () => {
  const { secantMetrics } = await rateModule();
  const outOfDomain = secantMetrics((x) => (x > 0 ? Math.log(x) : null), -1, 1);
  assert.equal(outOfDomain.valid, false);
  const infinity = secantMetrics((x) => (x === 0 ? Infinity : 1 / x), -1, 0);
  assert.equal(infinity.valid, false);
  const throwing = secantMetrics(
    () => {
      throw new Error('boom');
    },
    0,
    1,
  );
  assert.equal(throwing.valid, false);
});

test('interpolateSecantX2 clamps t and computes linearly', async () => {
  const { interpolateSecantX2 } = await rateModule();
  assert.equal(interpolateSecantX2(0, 4, 0.5), 2);
  assert.equal(interpolateSecantX2(0, 4, 0), 0);
  assert.equal(interpolateSecantX2(0, 4, 1), 4);
  assert.equal(interpolateSecantX2(0, 4, 1.5), 4, 't clamped');
  assert.equal(interpolateSecantX2(0, 4, -1), 0, 't clamped low');
});

test('secant records round-trip through the document', async () => {
  const { normalizeGraphDocument, toSerializableGraphDocument, hydrateGraphDocument } = await import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-document.js')).href,
  );
  const doc = {
    schemaVersion: 2,
    id: 'd',
    title: 't',
    functions: [{ id: 'f1', name: '', kind: 'preset', preset: 'quadratic', expr: '', coeffs: { a: 1, b: 0, c: 0 }, color: '#111', visible: true, locked: false, domain: { mode: 'viewport' } }],
    points: [],
    constructions: [
      { id: 'c1', kind: 'secant', fnId: 'f1', x1: 0, x2: 2, showDelta: true, locked: false, visible: true, extend: false },
    ],
    view: { boundingBox: [-8, 8, 8, -8], axes: {} },
    presentation: { activeFunctionId: 'f1', compare: null },
    annotations: { version: 1, strokes: [] },
    meta: { createdAt: '', updatedAt: '' },
  };
  const normalized = normalizeGraphDocument(doc);
  assert.equal(normalized.ok, true, normalized.message);
  const serialized = JSON.parse(JSON.stringify(toSerializableGraphDocument(normalized.document)));
  const hydrated = hydrateGraphDocument(serialized);
  assert.equal(hydrated.ok, true, hydrated.message);
  assert.deepEqual(hydrated.document.constructions[0], normalized.document.constructions[0]);
  assert.equal(hydrated.document.constructions[0].kind, 'secant');
  assert.equal(hydrated.document.constructions[0].fnId, 'f1');
  assert.equal(hydrated.document.constructions[0].x1, 0);
  assert.equal(hydrated.document.constructions[0].x2, 2);
  assert.equal('els' in hydrated.document.constructions[0], false);
});

test('secant showDelta false and x1/x2 survive normalize and constructionDocumentRecord', async () => {
  const { normalizeGraphDocument } = await import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-document.js')).href,
  );
  const { constructionDocumentRecord } = await import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/construction/restore.js')).href,
  );
  const doc = {
    schemaVersion: 2,
    id: 'd',
    title: 't',
    functions: [{ id: 'f1', name: '', kind: 'preset', preset: 'quadratic', expr: '', coeffs: { a: 1, b: 0, c: 0 }, color: '#111', visible: true, locked: false, domain: { mode: 'viewport' } }],
    points: [],
    constructions: [
      { id: 'c1', kind: 'secant', fnId: 'f1', x1: -2, x2: 3.5, showDelta: false, locked: false, visible: true, extend: false },
    ],
    view: { boundingBox: [-8, 8, 8, -8], axes: {} },
    presentation: { activeFunctionId: 'f1', compare: null },
    annotations: { version: 1, strokes: [] },
    meta: { createdAt: '', updatedAt: '' },
  };
  const normalized = normalizeGraphDocument(doc);
  assert.equal(normalized.ok, true, normalized.message);
  assert.equal(normalized.document.constructions[0].showDelta, false);
  assert.equal(normalized.document.constructions[0].x1, -2);
  assert.equal(normalized.document.constructions[0].x2, 3.5);

  // runtime 记录常带 els；提交桥必须保留锚点字段
  const runtimeRec = {
    ...normalized.document.constructions[0],
    els: [{}, {}],
    x1: -2,
    x2: 3.5,
    showDelta: false,
  };
  const committed = constructionDocumentRecord(runtimeRec);
  assert.equal(committed.x1, -2);
  assert.equal(committed.x2, 3.5);
  assert.equal(committed.showDelta, false);
  assert.equal('els' in committed, false);
});
