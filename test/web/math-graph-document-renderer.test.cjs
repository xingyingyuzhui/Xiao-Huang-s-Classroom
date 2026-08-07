/** 原子 runtime 发布：production renderer 失败恢复与 fatal 合同。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function rendererModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-document-renderer.js')).href,
  );
}

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

async function planModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-renderer.js')).href,
  );
}

/** 可编程失败的 fake runtime：记录每次 create/remove/update 与 fullRender。 */
function makeRuntime(options = {}) {
  const calls = [];
  const state = {
    functions: [],
    activeFnId: null,
    userPoints: [],
    constructions: [],
  };
  const makeContext = (overrides = {}, planMod = null) => {
    const runtime = {
      getState: () => state,
      createFnCurve(fn) {
        calls.push(['create-curve', fn.id]);
        if (options.failCreateCurve?.({ fn, calls })) {
          throw new Error('curve create exploded');
        }
        fn.curve = { id: fn.id };
      },
      detachFnCurve(fn) {
        calls.push(['detach-curve', fn?.id]);
        if (fn) fn.curve = null;
      },
      detachFunctionDependents() {
        calls.push(['detach-deps']);
      },
      rebindFunctionDependents() {
        calls.push(['rebind-deps']);
      },
      clearAllRuntime() {
        calls.push(['clear-all']);
        for (const fn of state.functions) fn.curve = null;
        state.userPoints = [];
        state.constructions = [];
      },
      pointLayer: {
        add(rec) {
          calls.push(['point-add', rec.id]);
          if (options.failPointAdd?.({ rec, calls })) throw new Error('point add exploded');
          state.userPoints.push({ ...rec, el: {} });
        },
        update() {},
        remove(id) {
          calls.push(['point-remove', id]);
          state.userPoints = state.userPoints.filter((p) => p.id !== id);
        },
      },
      constructionLayer: {
        add(rec) {
          calls.push(['constr-add', rec.id]);
          if (options.failConstrAdd?.({ rec, calls })) throw new Error('constr add exploded');
          state.constructions.push({ ...rec, els: [] });
        },
        update() {},
        remove(id) {
          calls.push(['constr-remove', id]);
          state.constructions = state.constructions.filter((c) => c.id !== id);
        },
      },
      refreshActiveMarks() {
        calls.push(['refresh-marks']);
      },
      mirrorActiveToLegacy() {
        calls.push(['mirror']);
      },
      applyView() {
        calls.push(['apply-view']);
      },
      applyReference() {
        calls.push(['apply-ref']);
      },
      renderFnList() {
        calls.push(['render-list']);
      },
      syncParamPanel() {
        calls.push(['sync-params']);
      },
      paintReadouts() {
        calls.push(['paint-readouts']);
      },
      computePlan: (previous, candidate) =>
        planMod.computeGraphRenderPlan(previous, candidate),
      applyIncremental: (plan, previous, candidate, action, preview) =>
        planMod.applyGraphRuntimePlan(runtime, plan, { previous, candidate, action, preview }),
      onFatal: (reason) => {
        state.fatalReason = reason;
        calls.push(['fatal', reason]);
      },
      ...overrides,
    };
    return runtime;
  };
  return { state, calls, makeContext };
}

const fn = (id, overrides = {}) => ({
  id,
  name: '',
  kind: 'preset',
  preset: 'quadratic',
  expr: '',
  coeffs: { a: 1, b: 0, c: 0 },
  colorSlot: 0,
  explicitColor: null,
  visible: true,
  locked: false,
  domain: { mode: 'viewport' },
  ...overrides,
});

async function setup(options = {}) {
  const [rendererMod, storeMod, docMod, planMod] = await Promise.all([
    rendererModule(),
    storeModule(),
    documentModule(),
    planModule(),
  ]);
  const runtime = makeRuntime(options);
  const context = runtime.makeContext(options.contextOverrides || {}, planMod);
  const renderer = rendererMod.createGraphDocumentRenderer(context);
  const doc = docMod.createDefaultGraphDocument({});
  const store = storeMod.createGraphStore(doc, { beforeCommit: renderer.beforeCommit });
  /** mount 合同：首次 fullRender 建立初始 runtime */
  function mount() {
    renderer.fullRender(store.getDocument());
    runtime.state.functions = store
      .getDocument()
      .functions.map((f) => ({ ...f, curve: { id: f.id } }));
    runtime.calls.length = 0;
  }
  return { renderer, store, runtime, doc, planMod, mount };
}

test('second function add failure keeps store/runtime at previous and disposes staged', async () => {
  let adds = 0;
  const { renderer, store, runtime } = await setup({
    failCreateCurve: () => {
      adds += 1;
      return adds === 2;
    },
  });
  const seen = [];
  store.subscribe(() => seen.push('event'));
  const before = store.getDocument();
  // 初始 fullRender（mount 合同）
  renderer.fullRender(before);
  runtime.state.functions = before.functions.map((f) => ({ ...f, curve: { id: f.id } }));
  runtime.calls.length = 0;

  const result = store.dispatchResult({
    type: 'function/add',
    payload: { function: fn('f2') },
  });
  assert.equal(result.ok, false, `result: ${JSON.stringify(result)}`);
  assert.equal(result.reason, 'RENDER_FAILED', `result: ${JSON.stringify(result)}`);
  assert.equal(store.getDocument(), before, 'store current stays previous');
  assert.deepEqual(seen, [], 'no subscriber sees failed action');
  // 恢复走 fullRender(previous)：clear-all 至少一次，runtime 与 previous 对应
  assert.ok(
    runtime.calls.some(([c]) => c === 'clear-all'),
    `expected clear-all in calls: ${JSON.stringify(runtime.calls)}`,
  );
  assert.equal(
    runtime.state.functions.filter((f) => f.curve).length,
    before.functions.length,
    `state: ${JSON.stringify(runtime.state.functions.map((f) => ({ id: f.id, hasCurve: Boolean(f.curve) })))} calls: ${JSON.stringify(runtime.calls)}`,
  );
});

test('point add failure after function update triggers full restore', async () => {
  const { store, runtime } = await setup({
    failPointAdd: () => true,
  });
  const before = store.getDocument();
  const seen = [];
  store.subscribe(() => seen.push('event'));
  const result = store.dispatchResult({
    type: 'point/add',
    payload: { point: { id: 'U1', x: 0, y: 0, constraint: { kind: 'free' } } },
  });
  assert.equal(result.ok, false);
  assert.equal(store.getDocument(), before);
  assert.deepEqual(seen, []);
  assert.ok(runtime.calls.some(([c]) => c === 'clear-all'));
});

test('construction removal then failing add restores previous runtime', async () => {
  const { store, runtime } = await setup({
    failConstrAdd: ({ rec }) => rec.id === 'c2',
  });
  const seen = [];
  store.subscribe(() => seen.push('event'));
  // 先成功加 c1，再让 c2 失败；失败后文档保持 c1 成功后的状态
  store.dispatchResult({
    type: 'construction/add',
    payload: { construction: { id: 'c1', kind: 'segment', pointIds: [] } },
  });
  seen.length = 0;
  const before = store.getDocument();
  const result = store.dispatchResult({
    type: 'construction/add',
    payload: { construction: { id: 'c2', kind: 'segment', pointIds: [] } },
  });
  assert.equal(result.ok, false);
  assert.equal(store.getDocument(), before, 'failed add must not publish');
  assert.deepEqual(seen, []);
  assert.ok(runtime.calls.some(([c]) => c === 'clear-all'));
});

test('failed full render enters fatal and rejects subsequent actions', async () => {
  let adds = 0;
  const { renderer, store, runtime } = await setup({
    failCreateCurve: () => {
      adds += 1;
      return adds === 2;
    },
    contextOverrides: {
      clearAllRuntime() {
        runtime.calls.push(['clear-all']);
        throw new Error('board exploded on clear');
      },
    },
  });
  // mount：fullRender 成功建立 f1（adds=1）
  renderer.fullRender(store.getDocument());
  runtime.state.functions = store.getDocument().functions.map((f) => ({ ...f, curve: { id: f.id } }));
  const before = store.getDocument();
  const result = store.dispatchResult({
    type: 'function/add',
    payload: { function: fn('f9') },
  });
  assert.equal(result.ok, false, `result: ${JSON.stringify(result)}`);
  assert.equal(renderer.getStatus(), 'fatal');
  // fatal 后拒绝一切 action
  const after = store.dispatchResult({
    type: 'function/update',
    payload: { id: 'f1', patch: { visible: false } },
  });
  assert.equal(after.ok, false);
  assert.equal(store.getDocument(), before);
});

test('successful publish projects exactly once and updates store', async () => {
  const { store, runtime, mount } = await setup();
  mount();
  // 参数变化 → 曲线重建恰好一次
  const result = store.dispatchResult({
    type: 'function/update',
    payload: { id: 'f1', patch: { coeffs: { a: 2, b: 0, c: 0 } } },
  });
  assert.equal(result.ok, true);
  assert.equal(store.getDocument().functions[0].coeffs.a, 2);
  const createCalls = runtime.calls.filter(([c]) => c === 'create-curve').length;
  assert.equal(createCalls, 1, 'one curve rebuild per update');
  assert.ok(runtime.calls.some(([c]) => c === 'render-list'));
  // 仅显隐切换：隐藏不重建曲线（visible 是属性投影）
  runtime.calls.length = 0;
  const vis = store.dispatchResult({
    type: 'function/update',
    payload: { id: 'f1', patch: { visible: false } },
  });
  assert.equal(vis.ok, true);
  assert.equal(runtime.calls.filter(([c]) => c === 'create-curve').length, 0);
  assert.ok(runtime.calls.some(([c]) => c === 'detach-curve'));
});
