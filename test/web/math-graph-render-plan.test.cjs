/** 纯 render plan：previous/current 文档差异、拓扑顺序与最小增量保证。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function rendererModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-renderer.js')).href,
  );
}

async function runtimeModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-runtime.js')).href,
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

function documentWith({ functions = [fn('f1'), fn('f2')], points = [], constructions = [], active = 'f1' } = {}) {
  return {
    schemaVersion: 1,
    id: 'd',
    title: 't',
    functions,
    points,
    constructions,
    view: { boundingBox: [-8, 8, 8, -8], axes: {} },
    presentation: { activeFunctionId: active, compare: null },
    annotations: { version: 1, strokes: [] },
    meta: { createdAt: '', updatedAt: '' },
  };
}

test('changing one coefficient only plans an update for that function', async () => {
  const { computeGraphRenderPlan } = await rendererModule();
  const before = documentWith();
  const after = documentWith();
  after.functions = before.functions.map((f) =>
    f.id === 'f1' ? { ...f, coeffs: { a: 2, b: 0, c: 0 } } : f,
  );

  const plan = computeGraphRenderPlan(before, after);
  assert.deepEqual(plan.functions.add, []);
  assert.deepEqual(plan.functions.remove, []);
  assert.deepEqual(plan.functions.update.map((u) => u.id), ['f1']);
  assert.deepEqual(plan.points.add, []);
  assert.deepEqual(plan.points.update, []);
  assert.deepEqual(plan.points.remove, []);
  assert.deepEqual(plan.constructions.add, []);
  assert.deepEqual(plan.constructions.update, []);
  assert.deepEqual(plan.constructions.remove, []);
  assert.equal(plan.viewChanged, false);
  assert.equal(plan.activeFunctionChanged, false);
});

test('new functions appear in add with upstream-first ordering', async () => {
  const { computeGraphRenderPlan } = await rendererModule();
  const before = documentWith({ functions: [fn('f1')] });
  const after = documentWith({ functions: [fn('f1'), fn('f2')] });
  const plan = computeGraphRenderPlan(before, after);
  assert.deepEqual(plan.functions.add.map((f) => f.id), ['f2']);
  assert.deepEqual(plan.functions.update, []);
  assert.deepEqual(plan.addOrder, ['f2']);
});

test('removal orders downstream constructions and points before functions', async () => {
  const { computeGraphRenderPlan } = await rendererModule();
  const before = documentWith({
    functions: [fn('f1'), fn('f2')],
    points: [
      { id: 'p1', name: 'A', x: 0, y: 0, showCoords: true, locked: false },
      { id: 'p2', name: 'B', x: 1, y: 1, showCoords: true, locked: false },
    ],
    constructions: [
      { id: 'c1', kind: 'segment', pointIds: ['p1', 'p2'], locked: false, visible: true, extend: false },
      { id: 'c2', kind: 'tangent', pointIds: ['p1'], fnId: 'f1', locked: false, visible: true, extend: false },
    ],
  });
  const after = documentWith({
    functions: [fn('f2')],
    points: [
      { id: 'p1', name: 'A', x: 0, y: 0, showCoords: true, locked: false },
      { id: 'p2', name: 'B', x: 1, y: 1, showCoords: true, locked: false },
    ],
    constructions: [
      { id: 'c1', kind: 'segment', pointIds: ['p1', 'p2'], locked: false, visible: true, extend: false },
    ],
  });
  const plan = computeGraphRenderPlan(before, after);
  assert.deepEqual(plan.functions.remove, ['f1']);
  assert.deepEqual(plan.constructions.remove, ['c2'], 'tangent referencing f1 must go');
  assert.equal(plan.constructions.remove.includes('c1'), false, 'c1 does not depend on f1');
  assert.deepEqual(plan.points.remove, []);
  // 拓扑：下游构造先于函数
  assert.ok(plan.removeOrder.indexOf('c2') < plan.removeOrder.indexOf('f1'));
});

test('visibility toggle is an update, never add/remove', async () => {
  const { computeGraphRenderPlan } = await rendererModule();
  const before = documentWith();
  const after = documentWith();
  after.functions = before.functions.map((f) => (f.id === 'f2' ? { ...f, visible: false } : f));
  const plan = computeGraphRenderPlan(before, after);
  assert.deepEqual(plan.functions.update.map((u) => u.id), ['f2']);
  assert.deepEqual(plan.functions.add, []);
  assert.deepEqual(plan.functions.remove, []);
});

test('view and active function changes are reported without record diffs', async () => {
  const { computeGraphRenderPlan } = await rendererModule();
  const before = documentWith();
  const after = documentWith({ active: 'f2' });
  after.view = { boundingBox: [-5, 5, 5, -5], axes: { grid: false } };
  const plan = computeGraphRenderPlan(before, after);
  assert.equal(plan.viewChanged, true);
  assert.equal(plan.activeFunctionChanged, true);
  assert.deepEqual(plan.functions.add, []);
  assert.deepEqual(plan.functions.update, []);
  assert.deepEqual(plan.functions.remove, []);
});

test('dependency refresh covers constructions referencing updated functions', async () => {
  const { computeGraphRenderPlan } = await rendererModule();
  const constructions = [
    { id: 'c1', kind: 'tangent', pointIds: ['p1'], fnId: 'f1', locked: false, visible: true, extend: false },
    { id: 'c2', kind: 'segment', pointIds: ['p9', 'p8'], locked: false, visible: true, extend: false },
  ];
  const before = documentWith({ constructions });
  const after = documentWith({ constructions });
  after.functions = before.functions.map((f) =>
    f.id === 'f1' ? { ...f, coeffs: { a: 3, b: 0, c: 0 } } : f,
  );
  const plan = computeGraphRenderPlan(before, after);
  assert.deepEqual(plan.dependencyRefreshIds, ['c1']);
  assert.equal(plan.dependencyRefreshIds.includes('c2'), false);
});

test('no record id appears in both add and remove', async () => {
  const { computeGraphRenderPlan } = await rendererModule();
  const before = documentWith({ functions: [fn('f1'), fn('f2')] });
  const after = documentWith({ functions: [fn('f2'), fn('f3')] });
  const plan = computeGraphRenderPlan(before, after);
  const addIds = new Set([
    ...plan.functions.add.map((r) => r.id),
    ...plan.points.add.map((r) => r.id),
    ...plan.constructions.add.map((r) => r.id),
  ]);
  const removeIds = new Set([...plan.functions.remove, ...plan.points.remove, ...plan.constructions.remove]);
  for (const id of addIds) {
    assert.equal(removeIds.has(id), false, `${id} must not be added and removed at once`);
  }
});

test('runtime registry manages layer handles and disposes each once', async () => {
  const { createGraphRuntimeRegistry, createGraphLayerHandle } = await runtimeModule();
  const registry = createGraphRuntimeRegistry();
  let disposed = 0;
  const handle = createGraphLayerHandle({
    disposers: [
      () => {
        disposed += 1;
      },
    ],
  });
  registry.set('f1', handle);
  assert.equal(registry.has('f1'), true);
  assert.equal(registry.size(), 1);
  registry.delete('f1');
  assert.equal(disposed, 1);
  registry.set('f2', createGraphLayerHandle({}));
  registry.clear();
  assert.equal(registry.size(), 0);
});

test('function layer applies add/update/remove against a fake board', async () => {
  const { applyFunctionPlan, computeGraphRenderPlan } = await rendererModule();
  const runtime = await runtimeModule();
  const registry = runtime.createGraphRuntimeRegistry();
  const created = [];
  const removed = [];
  const board = {
    create(type, coords, attrs) {
      const el = { type, coords, attrs, visible: attrs.visible !== false, setAttribute(patch) { Object.assign(this.attrs, patch); } };
      created.push(el);
      return el;
    },
    removeObject(el) {
      removed.push(el);
    },
  };
  const evaluator = {
    resolve: (record) => (x) => x * record.coeffs.a,
  };

  const doc = documentWith({ functions: [fn('f1'), fn('f2')] });
  const plan = computeGraphRenderPlan(documentWith({ functions: [fn('f1')] }), doc);
  applyFunctionPlan(plan, { board, registry, evaluator, functions: doc.functions });

  assert.equal(created.length, 1, 'only the added function creates a curve');
  assert.equal(registry.size(), 1);
  assert.equal(registry.has('f2'), true);

  // 参数更新：只更新 f2 曲线属性，不新建
  const before2 = doc;
  const after2 = documentWith();
  after2.functions = doc.functions.map((f) => (f.id === 'f2' ? { ...f, coeffs: { a: 5, b: 0, c: 0 } } : f));
  const plan2 = computeGraphRenderPlan(before2, after2);
  const createdBefore = created.length;
  applyFunctionPlan(plan2, { board, registry, evaluator, functions: after2.functions });
  assert.equal(created.length, createdBefore, 'coefficient update must not create a new curve');
  const f2Handle = registry.get('f2');
  assert.ok(f2Handle);
  assert.equal(f2Handle.evaluator(2), 10);

  // 删除
  const plan3 = computeGraphRenderPlan(after2, documentWith({ functions: [fn('f1')] }));
  applyFunctionPlan(plan3, { board, registry, evaluator, functions: [fn('f1')] });
  assert.equal(registry.has('f2'), false);
  assert.equal(registry.size(), 0);
  assert.equal(removed.length, 1);
});

test('a failing later add rolls back staged handles and keeps previous runtime', async () => {
  const { applyFunctionPlan, computeGraphRenderPlan } = await rendererModule();
  const runtime = await runtimeModule();
  const registry = runtime.createGraphRuntimeRegistry();
  const disposed = [];
  const board = {
    create(type, coords, attrs) {
      if (registry.size() >= 1) {
        throw new Error('board exploded on second create');
      }
      const el = { type, coords, attrs, setAttribute(patch) { Object.assign(this.attrs, patch); } };
      return el;
    },
    removeObject(el) {},
  };
  const evaluator = { resolve: (record) => (x) => x * record.coeffs.a };

  // previous：只有 f1
  const before = documentWith({ functions: [fn('f1')] });
  const plan = computeGraphRenderPlan(before, documentWith({ functions: [fn('f1'), fn('f2'), fn('f3')] }));
  assert.throws(() => {
    applyFunctionPlan(plan, { board, registry, evaluator, functions: [fn('f1'), fn('f2'), fn('f3')] });
  });
  // 失败的 add 全部回滚：runtime 与 previous document 一致（仅 f1）
  assert.equal(registry.has('f1'), false, 'f1 was not present before this plan either');
  assert.equal(registry.size(), 0, 'no partial staged handles may remain');
  assert.equal(disposed.length, 0);
});

test('an updated handle is restored when a later add fails', async () => {
  const { applyFunctionPlan, computeGraphRenderPlan } = await rendererModule();
  const runtime = await runtimeModule();
  const registry = runtime.createGraphRuntimeRegistry();
  let createCount = 0;
  const board = {
    create(type, coords, attrs) {
      createCount += 1;
      if (createCount > 1) throw new Error('second create failed');
      return { type, coords, attrs, setAttribute(patch) { Object.assign(this.attrs, patch); } };
    },
    removeObject() {},
  };
  const evaluator = { resolve: (record) => (x) => x * record.coeffs.a };

  // 先把 f1 装上（previous runtime）
  const prevDoc = documentWith({ functions: [fn('f1')] });
  const initialPlan = computeGraphRenderPlan(documentWith({ functions: [] }), prevDoc);
  applyFunctionPlan(initialPlan, { board, registry, evaluator, functions: prevDoc.functions });
  const f1 = registry.get('f1');
  assert.equal(f1.evaluator(2), 2);

  // 计划：更新 f1（a=7）+ 新增 f2 → 新增失败
  const nextDoc = documentWith({ functions: [{ ...fn('f1'), coeffs: { a: 7, b: 0, c: 0 } }, fn('f2')] });
  const plan = computeGraphRenderPlan(prevDoc, nextDoc);
  assert.throws(() => {
    applyFunctionPlan(plan, { board, registry, evaluator, functions: nextDoc.functions });
  });
  // f1 必须恢复为 previous 记录，f2 不得残留
  const restored = registry.get('f1');
  assert.ok(restored);
  assert.equal(restored.record.coeffs.a, 1, 'updated handle must be restored to previous record');
  assert.equal(restored.evaluator(2), 2);
  assert.equal(registry.has('f2'), false);
});

test('legacy geometry round-trips through the document losslessly', async () => {
  const { computeGraphRenderPlan } = await rendererModule();
  const documentModule = await import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-document.js')).href,
  );
  const { normalizeGraphDocument, toSerializableGraphDocument, hydrateGraphDocument } = documentModule;

  const legacyDoc = {
    schemaVersion: 1,
    id: 'd',
    title: 't',
    functions: [
      fn('f1'),
      fn('f2'),
      { id: 'f3', name: '', kind: 'preset', preset: 'abs', expr: '', coeffs: { a: 1, b: 0, c: 0 }, color: '#333', visible: true, locked: false, domain: { mode: 'viewport' } },
    ],
    points: [
      // 普通跟随点
      { id: 'p1', name: 'A', x: 1, y: 2, constraint: { kind: 'followFunction', functionId: 'f1', anchorX: 1 }, showCoords: true, locked: false, style: { stroke: { explicitColor: '#ff0000' }, fill: { explicitColor: '#00ff00', opacity: 0.5 }, size: 6, face: 'o', label: { fontSize: 16 } } },
      // 顶点特征跟随
      { id: 'p2', name: 'V', x: 0, y: 0, constraint: { kind: 'followFeature', functionId: 'f1', feature: 'vertex', featureIndex: 0 }, showCoords: true, locked: false },
      // 函数×函数交点（只作为一个 GraphPoint，不重复保存 intersection 构造）
      { id: 'p3', name: 'I', x: 0.5, y: 0.5, constraint: { kind: 'intersection', targetIds: ['f1', 'f2'], nearX: 0.5 }, showCoords: true, locked: false },
    ],
    constructions: [
      { id: 'c1', kind: 'segment', pointIds: ['p1', 'p2'], locked: false, visible: true, extend: true },
      { id: 'c2', kind: 'tangent', pointIds: ['p1'], fnId: 'f1', locked: false, visible: true, extend: false },
      { id: 'c3', kind: 'perp', pointIds: ['p1'], perpTarget: 'line', targetConstrId: 'c1', locked: false, visible: true, extend: true },
      { id: 'c4', kind: 'perp', pointIds: ['p2'], perpTarget: 'curve', fnId: 'f1', locked: false, visible: true, extend: false },
    ],
    view: { boundingBox: [-9, 7, 7, -9], axes: { grid: true } },
    presentation: { activeFunctionId: 'f1', compare: null },
    annotations: { version: 1, strokes: [{ id: 's1', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], width: 3, opacity: 1 }] },
    meta: { createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
  };

  const normalized = normalizeGraphDocument(legacyDoc);
  assert.equal(normalized.ok, true, normalized.message);
  const serialized = JSON.parse(JSON.stringify(toSerializableGraphDocument(normalized.document)));
  const hydrated = hydrateGraphDocument(serialized);
  assert.equal(hydrated.ok, true, hydrated.message);
  assert.deepEqual(hydrated.document, normalized.document);

  // 交点只保留一个 GraphPoint：文档中不存在 intersection construction
  assert.equal(
    normalized.document.constructions.some((c) => c.kind === 'intersect'),
    false,
    'intersections are carried by point constraints, not constructions',
  );
  // 视口/样式/批注无损
  assert.deepEqual(normalized.document.view.boundingBox, [-9, 7, 7, -9]);
  assert.equal(normalized.document.points[0].style.stroke.explicitColor, '#ff0000');
  assert.equal(normalized.document.points[0].style.size, 6);
  assert.equal(normalized.document.annotations.strokes.length, 1);
});

test('parameter change plans no geometry removal for unrelated objects', async () => {
  const { computeGraphRenderPlan } = await rendererModule();
  const before = documentWith({
    points: [
      { id: 'p1', name: 'A', x: 1, y: 2, constraint: { kind: 'followFunction', functionId: 'f1', anchorX: 1 }, showCoords: true, locked: false },
      { id: 'p2', name: 'B', x: 3, y: 4, constraint: { kind: 'free' }, showCoords: true, locked: false },
    ],
    constructions: [
      { id: 'c1', kind: 'segment', pointIds: ['p1', 'p2'], locked: false, visible: true, extend: false },
      { id: 'c2', kind: 'tangent', pointIds: ['p1'], fnId: 'f2', locked: false, visible: true, extend: false },
    ],
  });
  const after = documentWith({
    points: before.points,
    constructions: before.constructions,
  });
  after.functions = before.functions.map((f) => (f.id === 'f1' ? { ...f, coeffs: { a: 2, b: 0, c: 0 } } : f));

  const plan = computeGraphRenderPlan(before, after);
  assert.deepEqual(plan.functions.update.map((u) => u.id), ['f1']);
  assert.deepEqual(plan.points.remove, [], 'no user point may be cleared by a param change');
  assert.deepEqual(plan.constructions.remove, [], 'no construction may be cleared by a param change');
  assert.deepEqual(plan.dependencyRefreshIds, [], 'f2 tangent does not depend on f1');
});
