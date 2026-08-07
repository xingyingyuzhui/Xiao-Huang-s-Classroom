/** GraphStore：纯 reducer + 两阶段发布 store + 事务。 */
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

async function documentModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-document.js')).href,
  );
}

async function makeStore(overrides = {}) {
  const { createGraphStore } = await storeModule();
  const { createDefaultGraphDocument } = await documentModule();
  const doc = createDefaultGraphDocument({});
  const store = createGraphStore(doc, overrides);
  return { store, doc };
}

/** 两条预设函数 + 一点 + 一构造的文档 */
function richDocument() {
  return {
    schemaVersion: 2,
    id: 'd',
    title: 't',
    functions: [
      { id: 'f1', name: '', kind: 'preset', preset: 'quadratic', expr: '', coeffs: { a: 1, b: 0, c: 0 }, color: '#111', visible: true, locked: false, domain: { mode: 'viewport' } },
      { id: 'f2', name: '', kind: 'preset', preset: 'linear', expr: '', coeffs: { a: 2, b: 0, c: 0 }, color: '#222', visible: true, locked: false, domain: { mode: 'viewport' } },
    ],
    points: [{ id: 'p1', name: 'A', x: 1, y: 2, showCoords: true, locked: false }],
    constructions: [
      { id: 'c1', kind: 'segment', name: '线段', pointIds: ['p1', 'p2'], locked: false, visible: true, extend: false },
      { id: 'c2', kind: 'perp', name: '垂线', pointIds: ['p1'], targetConstrId: 'c1', locked: false, visible: true, extend: false },
    ],
    view: { boundingBox: [-8, 8, 8, -8], axes: {} },
    presentation: { activeFunctionId: 'f1', compare: null },
    annotations: { version: 1, strokes: [] },
    meta: { createdAt: '', updatedAt: '' },
  };
}

test('reducer updates are immutable and no-op patches keep reference identity', async () => {
  const { reduceGraphDocument } = await storeModule();
  const doc = richDocument();
  const next = reduceGraphDocument(doc, {
    type: 'function/update',
    payload: { id: 'f1', patch: { visible: false } },
  });
  assert.notEqual(next, doc);
  assert.equal(next.functions[0].visible, false);
  assert.equal(doc.functions[0].visible, true, 'input document must not mutate');
  // 未修改的部分保持引用
  assert.equal(next.points, doc.points);

  const noop = reduceGraphDocument(doc, {
    type: 'function/update',
    payload: { id: 'missing', patch: { visible: false } },
  });
  assert.equal(noop, doc, 'invalid id must keep the original reference');
});

test('reducer covers function/point/construction/view/presentation actions', async () => {
  const { reduceGraphDocument } = await storeModule();
  let doc = richDocument();

  // function/add
  doc = reduceGraphDocument(doc, {
    type: 'function/add',
    payload: { function: { id: 'f3', kind: 'custom', expr: 'x^2', color: '#333', visible: true, locked: false, domain: { mode: 'viewport' } } },
  });
  assert.equal(doc.functions.length, 3);
  assert.equal(doc.functions[2].id, 'f3');

  // 重复 id 不进 store
  const dup = reduceGraphDocument(doc, {
    type: 'function/add',
    payload: { function: { id: 'f3', kind: 'preset', preset: 'linear', color: '#444', visible: true } },
  });
  assert.equal(dup, doc);

  // function/remove
  doc = reduceGraphDocument(doc, { type: 'function/remove', payload: { id: 'f2' } });
  assert.deepEqual(doc.functions.map((f) => f.id), ['f1', 'f3']);

  // function/reorder 必须是全量排列
  doc = reduceGraphDocument(doc, {
    type: 'function/reorder',
    payload: { ids: ['f3', 'f1'] },
  });
  assert.deepEqual(doc.functions.map((f) => f.id), ['f3', 'f1']);
  const badReorder = reduceGraphDocument(doc, {
    type: 'function/reorder',
    payload: { ids: ['f3'] },
  });
  assert.equal(badReorder, doc, 'reorder must be a full permutation');

  // point/add + point/update
  doc = reduceGraphDocument(doc, { type: 'point/add', payload: { point: { id: 'p9', name: 'B', x: 0, y: 0, showCoords: true } } });
  assert.equal(doc.points.length, 2);
  doc = reduceGraphDocument(doc, { type: 'point/update', payload: { id: 'p9', patch: { x: 5 } } });
  assert.equal(doc.points.find((p) => p.id === 'p9').x, 5);

  // construction/add + update
  doc = reduceGraphDocument(doc, {
    type: 'construction/add',
    payload: { construction: { id: 'c9', kind: 'line', pointIds: ['p9', 'p1'], locked: false, visible: true, extend: false } },
  });
  assert.equal(doc.constructions.length, 3);
  doc = reduceGraphDocument(doc, { type: 'construction/update', payload: { id: 'c9', patch: { extend: true } } });
  assert.equal(doc.constructions.find((c) => c.id === 'c9').extend, true);

  // view/update 与 presentation/update
  doc = reduceGraphDocument(doc, { type: 'view/update', payload: { patch: { boundingBox: [-5, 5, 5, -5] } } });
  assert.deepEqual(doc.view.boundingBox, [-5, 5, 5, -5]);
  doc = reduceGraphDocument(doc, { type: 'presentation/update', payload: { patch: { activeFunctionId: 'f1' } } });
  assert.equal(doc.presentation.activeFunctionId, 'f1');
});

test('reducer cascades construction removal downstream-first', async () => {
  const { reduceGraphDocument } = await storeModule();
  const doc = richDocument();
  // 删除 c1（线段）→ 引用它的 c2（垂线）也要删除
  const next = reduceGraphDocument(doc, { type: 'construction/removeCascade', payload: { id: 'c1' } });
  assert.deepEqual(next.constructions.map((c) => c.id), []);
  assert.equal(next.points, doc.points, 'points stay untouched');
});

test('reducer cascades point removal to dependent constructions', async () => {
  const { reduceGraphDocument } = await storeModule();
  const doc = richDocument();
  const next = reduceGraphDocument(doc, { type: 'point/removeCascade', payload: { id: 'p1' } });
  // c1 与 c2 都引用 p1
  assert.deepEqual(next.points.map((p) => p.id), []);
  assert.deepEqual(next.constructions.map((c) => c.id), []);
});

test('reducer cascades function removal to constructions referencing it', async () => {
  const { reduceGraphDocument } = await storeModule();
  const doc = {
    ...richDocument(),
    functions: [
      ...richDocument().functions,
      { id: 'f3', name: '', kind: 'preset', preset: 'abs', expr: '', coeffs: { a: 1, b: 0, c: 0 }, color: '#333', visible: true, locked: false, domain: { mode: 'viewport' } },
    ],
    constructions: [
      { id: 'c1', kind: 'segment', pointIds: ['p1', 'p2'], locked: false, visible: true, extend: false },
      { id: 'c3', kind: 'tangent', pointIds: ['p1'], fnId: 'f3', locked: false, visible: true, extend: false },
    ],
  };
  const next = reduceGraphDocument(doc, { type: 'function/remove', payload: { id: 'f3' } });
  assert.deepEqual(next.functions.map((f) => f.id), ['f1', 'f2']);
  // 引用 f3 的切线构造级联删除；无关构造保留
  assert.deepEqual(next.constructions.map((c) => c.id), ['c1']);
});

test('reducer cascades function removal to points constrained on that function', async () => {
  const { reduceGraphDocument } = await storeModule();
  const doc = {
    ...richDocument(),
    functions: [
      ...richDocument().functions,
      { id: 'f3', name: '', kind: 'preset', preset: 'abs', expr: '', coeffs: { a: 1, b: 0, c: 0 }, color: '#333', visible: true, locked: false, domain: { mode: 'viewport' } },
    ],
    points: [
      { id: 'p1', name: 'A', x: 1, y: 2, showCoords: true, locked: false, constraint: { kind: 'free' } },
      {
        id: 'pFollow',
        name: 'F',
        x: 0,
        y: 0,
        showCoords: true,
        locked: false,
        constraint: { kind: 'followFunction', functionId: 'f3', anchorX: 1 },
      },
      {
        id: 'pFeature',
        name: 'V',
        x: 0,
        y: 0,
        showCoords: true,
        locked: false,
        constraint: { kind: 'followFeature', functionId: 'f3', feature: 'vertex', featureIndex: 0 },
      },
      {
        id: 'pIx',
        name: 'I',
        x: 0,
        y: 0,
        showCoords: true,
        locked: false,
        constraint: { kind: 'intersection', targetIds: ['f1', 'f3'], nearX: 0 },
      },
    ],
    constructions: [
      { id: 'c1', kind: 'segment', pointIds: ['p1', 'pFollow'], locked: false, visible: true, extend: false },
      { id: 'cTangent', kind: 'tangent', pointIds: ['pFollow'], fnId: 'f3', locked: false, visible: true, extend: false },
    ],
  };
  const next = reduceGraphDocument(doc, { type: 'function/remove', payload: { id: 'f3' } });
  assert.deepEqual(next.functions.map((f) => f.id), ['f1', 'f2']);
  assert.deepEqual(next.points.map((p) => p.id), ['p1'], 'only free points survive');
  assert.deepEqual(next.constructions.map((c) => c.id), [], 'constructions of doomed points also cascade');
});

test('annotations/replace does not touch structure and keeps history out via meta', async () => {
  const { reduceGraphDocument } = await storeModule();
  const doc = richDocument();
  const next = reduceGraphDocument(doc, {
    type: 'annotations/replace',
    payload: { annotations: { version: 1, strokes: [{ id: 's1', points: [{ x: 0, y: 0 }] }] } },
    meta: { record: false, persist: true },
  });
  assert.notEqual(next, doc);
  assert.equal(next.annotations.strokes.length, 1);
  assert.equal(next.functions, doc.functions);
});

test('document/replace swaps the whole document', async () => {
  const { reduceGraphDocument } = await storeModule();
  const doc = richDocument();
  const replacement = richDocument();
  replacement.functions = [];
  replacement.points = [];
  replacement.constructions = [];
  const next = reduceGraphDocument(doc, { type: 'document/replace', payload: { document: replacement } });
  assert.equal(next, replacement);
});

test('store publishes only after beforeCommit succeeds', async () => {
  const { store } = await makeStore();
  const seen = [];
  store.subscribe((event) => seen.push(event.action.type));
  const before = store.getDocument();
  const result = store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { visible: false } } });
  assert.notEqual(result, before);
  assert.equal(result, store.getDocument());
  assert.deepEqual(seen, ['function/update']);
  assert.equal(store.getDocument().functions[0].visible, false);
});

test('store discards the candidate when beforeCommit fails and notifies nobody', async () => {
  let commitCalls = 0;
  const failing = () => {
    commitCalls += 1;
    return { ok: false };
  };
  const { store } = await makeStore({ beforeCommit: failing });
  const seen = [];
  store.subscribe(() => seen.push('event'));
  const before = store.getDocument();
  const result = store.dispatch({ type: 'function/add', payload: { function: { id: 'f9', kind: 'custom', expr: 'x', color: '#999', visible: true } } });
  assert.equal(result, before, 'failed commit must keep current document');
  assert.deepEqual(seen, [], 'no subscriber may see a failed action');
  assert.equal(commitCalls, 1);
});

test('store discards candidate when beforeCommit throws', async () => {
  const throwing = () => {
    throw new Error('renderer exploded');
  };
  const { store } = await makeStore({ beforeCommit: throwing });
  const seen = [];
  store.subscribe(() => seen.push('event'));
  const before = store.getDocument();
  store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { visible: false } } });
  assert.equal(store.getDocument(), before);
  assert.deepEqual(seen, []);
});

test('transaction coalesces preview dispatches into one commit', async () => {
  const { store } = await makeStore();
  const seen = [];
  store.subscribe((event) => seen.push(event.action.type));
  store.beginTransaction();
  for (let i = 0; i < 50; i += 1) {
    store.dispatch({
      type: 'function/update',
      payload: { id: 'f1', patch: { coeffs: { a: i / 10, b: 0, c: 0 } } },
    });
  }
  assert.deepEqual(seen, [], 'previews must not publish');
  const committed = store.commitTransaction();
  assert.deepEqual(seen, ['transaction/commit']);
  assert.equal(committed.functions[0].coeffs.a, 4.9);
  assert.equal(store.getDocument().functions[0].coeffs.a, 4.9);
});

test('cancel transaction restores the starting document and notifies once', async () => {
  const { store } = await makeStore();
  const seen = [];
  store.subscribe((event) => seen.push(event.action.type));
  const before = store.getDocument();
  store.beginTransaction();
  store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { visible: false } } });
  store.cancelTransaction();
  assert.equal(store.getDocument(), before, 'cancel must restore the starting document');
  assert.deepEqual(seen, ['transaction/cancel'], 'exactly one restore notification');
});

test('cancel transaction reprojects previous document via beforeCommit', async () => {
  const { createGraphStore } = await storeModule();
  const { createDefaultGraphDocument } = await documentModule();
  const doc = createDefaultGraphDocument({});
  const calls = [];
  const store = createGraphStore(doc, {
    beforeCommit: (ctx) => {
      calls.push({
        preview: Boolean(ctx.preview),
        actionType: ctx.action?.type,
        candidateVisible: ctx.candidate?.functions?.[0]?.visible,
        previousVisible: ctx.previous?.functions?.[0]?.visible,
      });
      return { ok: true };
    },
  });
  store.beginTransaction();
  store.dispatch({ type: 'function/update', payload: { id: doc.functions[0].id, patch: { visible: false } } });
  assert.ok(calls.some((c) => c.preview && c.candidateVisible === false));
  store.cancelTransaction();
  const cancelCall = calls.find((c) => c.actionType === 'transaction/cancel');
  assert.ok(cancelCall, 'cancel must invoke beforeCommit to re-sync runtime');
  assert.equal(cancelCall.candidateVisible, true, 'cancel projects back to start document');
  assert.equal(cancelCall.previousVisible, false, 'previous is last preview geometry');
  assert.equal(store.getDocument().functions[0].visible, true);
});

test('empty transaction commit is a no-op without notifications', async () => {
  const { store } = await makeStore();
  const seen = [];
  store.subscribe((event) => seen.push(event.action.type));
  store.beginTransaction();
  store.commitTransaction();
  assert.deepEqual(seen, []);
});

test('subscribe returns an unsubscribe and dispose clears listeners', async () => {
  const { store } = await makeStore();
  let count = 0;
  const listener = () => {
    count += 1;
  };
  const unsubscribe = store.subscribe(listener);
  store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { visible: false } } });
  assert.equal(count, 1);
  unsubscribe();
  store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { visible: true } } });
  assert.equal(count, 1);
  store.subscribe(listener);
  store.dispose();
  store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { visible: false } } });
  assert.equal(count, 1);
});
