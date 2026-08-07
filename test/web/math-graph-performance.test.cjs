/**
 * 高频渲染调用次数不变量（Task 7 Step 1）。
 *
 * 用 fake frame scheduler（注入 requestAnimationFrame）驱动真实生产模块：
 *   graph-store.js / graph-renderer.js / graph-document-renderer.js /
 *   graph-dependency-plan.js / frame-task.js / graph-history.js /
 *   graph-document.js
 * 断言调用次数硬不变量（计数注入，不用毫秒）：
 *
 * 1. 同帧 100 次 coefficient input → render plan/runtime apply 最多一次（1 次）；
 *    最终文档用最后一个值；一次手势只形成一条 history。
 * 2. point coordinate update → 0 次 function create/remove。
 * 3. 函数列表只在集合/顺序/名称/颜色/显隐/锁定/选中态变化时 render；只改 coeffs → 0 次。
 * 4. 值表/特征只在 active function 数学定义或 active id 变化时 render。
 * 5. point move 不重绘函数列表和值表。
 *
 * 基线说明：本测试运行在 Task 4 基线（commit 3f22139，graph-document-renderer
 * 已接入生产 beforeCommit；Task 7 的 frame batching / UI diff flags 尚未落地）。
 * 当前行为：
 * - `applyGraphRuntimePlan` 每次 apply 无条件调用 renderFnList / syncParamPanel /
 *   paintReadouts（Task 7 Step 4 会加 functionListChanged/readoutsChanged flags）。
 * - store 事务内每次 preview dispatch 都同步 beforeCommit → 同一帧内 N 次 dispatch
 *   产生 N 次 apply（Task 7 Step 2 会限制每帧最多一次 runtime/DOM apply）。
 *
 * 因此需要 Task 7 才能满足的不变量标注 TODO(Task 7) 并用 `{ skip: ... }` 跳过；
 * 断言体保持可执行，Task 7 落地后去掉 skip 即可直接验证，无需改断言。
 * 当前已满足的不变量直接通过：生产 frame-task 合并（1 次 apply/1 条 history）、
 * point move 零函数重建、只更新 active 函数及其依赖、列表/读数“该渲染才渲染”的正例。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

// ───────────────────────── 生产模块加载 ─────────────────────────

async function storeModule() {
  return import(pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-store.js')).href);
}
async function planModule() {
  return import(pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-renderer.js')).href);
}
async function docRendererModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-document-renderer.js')).href,
  );
}
async function dependencyPlanModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-dependency-plan.js')).href,
  );
}
async function documentModule() {
  return import(pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-document.js')).href);
}
async function historyModule() {
  return import(pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-history.js')).href);
}
async function frameTaskModule() {
  return import(pathToFileURL(path.join(root, 'apps/web/src/math/shared/frame-task.js')).href);
}

// ───────────────────────── fake frame scheduler ─────────────────────────

/** 可手动触发的 requestAnimationFrame：同一时刻只保留一个待执行帧回调。 */
function createFakeFrameScheduler() {
  let callback = null;
  let requested = 0;
  return {
    requestFrame(fn) {
      callback = fn;
      requested += 1;
      return requested;
    },
    cancelFrame() {
      callback = null;
    },
    runFrame() {
      const fn = callback;
      callback = null;
      if (fn) fn();
    },
    pending: () => callback !== null,
  };
}

// ───────────────────────── fake runtime（计数注入） ─────────────────────────

function createCounters() {
  const counters = {
    createFnCurve: 0,
    detachFnCurve: 0,
    detachDeps: 0,
    rebindDeps: 0,
    clearAll: 0,
    pointAdd: 0,
    pointUpdate: 0,
    pointRemove: 0,
    constrAdd: 0,
    constrUpdate: 0,
    constrRemove: 0,
    renderFnList: 0,
    syncParamPanel: 0,
    paintReadouts: 0,
    refreshActiveMarks: 0,
    /** 记录被重建/卸载曲线的函数 id，用于“无关函数零重建”断言 */
    createdFnIds: [],
    detachedFnIds: [],
    reset() {
      this.createFnCurve = 0;
      this.detachFnCurve = 0;
      this.detachDeps = 0;
      this.rebindDeps = 0;
      this.clearAll = 0;
      this.pointAdd = 0;
      this.pointUpdate = 0;
      this.pointRemove = 0;
      this.constrAdd = 0;
      this.constrUpdate = 0;
      this.constrRemove = 0;
      this.renderFnList = 0;
      this.syncParamPanel = 0;
      this.paintReadouts = 0;
      this.refreshActiveMarks = 0;
      this.createdFnIds = [];
      this.detachedFnIds = [];
    },
  };
  return counters;
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

const freePoint = (id, x = 0, y = 0) => ({ id, x, y, constraint: { kind: 'free' } });

/**
 * 装配生产 renderer + store：computePlan/applyIncremental 使用生产
 * computeGraphRenderPlan / applyGraphRuntimePlan；renderer 作为 store 的
 * beforeCommit 投影到计数 runtime。
 */
async function setup() {
  const [storeMod, planMod, docRendererMod, docMod] = await Promise.all([
    storeModule(),
    planModule(),
    docRendererModule(),
    documentModule(),
  ]);
  const counters = createCounters();
  const state = {
    functions: [],
    activeFnId: null,
    userPoints: [],
    constructions: [],
    viewApplying: false,
  };
  const context = {
    getState: () => state,
    createFnCurve(fnRec) {
      counters.createFnCurve += 1;
      counters.createdFnIds.push(fnRec.id);
      fnRec.curve = { id: fnRec.id };
    },
    detachFnCurve(fnRec) {
      counters.detachFnCurve += 1;
      counters.detachedFnIds.push(fnRec?.id);
      if (fnRec) fnRec.curve = null;
    },
    detachFunctionDependents() {
      counters.detachDeps += 1;
    },
    rebindFunctionDependents() {
      counters.rebindDeps += 1;
    },
    clearAllRuntime() {
      counters.clearAll += 1;
      for (const f of state.functions) f.curve = null;
      state.userPoints = [];
      state.constructions = [];
    },
    pointLayer: {
      add(rec) {
        counters.pointAdd += 1;
        state.userPoints.push({ ...rec, el: {} });
      },
      update() {
        counters.pointUpdate += 1;
      },
      remove(id) {
        counters.pointRemove += 1;
        state.userPoints = state.userPoints.filter((p) => p.id !== id);
      },
    },
    constructionLayer: {
      add(rec) {
        counters.constrAdd += 1;
        state.constructions.push({ ...rec });
      },
      update() {
        counters.constrUpdate += 1;
      },
      remove(id) {
        counters.constrRemove += 1;
        state.constructions = state.constructions.filter((c) => c.id !== id);
      },
    },
    refreshActiveMarks() {
      counters.refreshActiveMarks += 1;
    },
    mirrorActiveToLegacy() {},
    applyView() {},
    applyReference() {},
    renderFnList() {
      counters.renderFnList += 1;
    },
    syncParamPanel() {
      counters.syncParamPanel += 1;
    },
    paintReadouts() {
      counters.paintReadouts += 1;
    },
    computePlan: (previous, candidate) => planMod.computeGraphRenderPlan(previous, candidate),
  };
  context.applyIncremental = (plan, previous, candidate, action, preview) =>
    planMod.applyGraphRuntimePlan(context, plan, { previous, candidate, action, preview });

  const renderer = docRendererMod.createGraphDocumentRenderer(context);
  const store = storeMod.createGraphStore(docMod.createDefaultGraphDocument({}), {
    beforeCommit: renderer.beforeCommit,
  });

  /** mount 合同：首次 fullRender 建立初始 runtime，之后清空计数。 */
  function mount() {
    renderer.fullRender(store.getDocument());
    state.functions = store
      .getDocument()
      .functions.map((f) => ({ ...f, curve: { id: f.id } }));
    counters.reset();
  }

  function dispatchOk(action) {
    const result = store.dispatchResult(action);
    assert.equal(result.ok, true, `action ${action.type} failed: ${JSON.stringify(result)}`);
    return result;
  }

  // mount-controller 源码（结构合同测试用）
  const fsMod = await import('node:fs');
  const mountSrc = fsMod.readFileSync(
    path.join(root, 'apps/web/src/math/graph/graph-mount-controller.js'),
    'utf8',
  );
  return { store, renderer, counters, state, mount, dispatchOk, mountSrc };
}

// ───────────────────────── 不变量 1：同帧合并 ─────────────────────────

test('同帧 100 次 coefficient input → 生产 frame-task 合并：1 次 apply、最后值、一条 history', async () => {
  const { store, counters, mount, dispatchOk } = await setup();
  const [frameMod, historyMod] = await Promise.all([frameTaskModule(), historyModule()]);
  mount();

  // 记录手势前的文档，供 undo 后对比
  const beforeCoeffs = JSON.parse(
    JSON.stringify(store.getDocument().functions[0].coeffs),
  );
  const history = historyMod.createGraphHistory(store);
  const scheduler = createFakeFrameScheduler();

  // 生产 frame-task：同帧内连续 input 只登记一个待执行帧；flush 提交最后一个值
  let pendingA = 1;
  const frameTask = frameMod.createFrameTask(
    () => {
      dispatchOk({
        type: 'function/update',
        payload: { id: 'f1', patch: { coeffs: { a: pendingA, b: 0, c: 0 } } },
      });
    },
    { requestFrame: scheduler.requestFrame, cancelFrame: scheduler.cancelFrame },
  );

  store.beginTransaction(); // 一次手势 = 一条 history
  for (let i = 1; i <= 100; i += 1) {
    pendingA = i * 2; // 每个 input 更新 pending 值
    frameTask.schedule(); // 同一 animation frame 内连续调度
  }
  assert.equal(scheduler.pending(), true, '输入后应恰有一个 pending frame');
  scheduler.runFrame(); // 帧回调 = 唯一一次 flush
  store.commitTransaction();

  assert.equal(counters.createFnCurve, 1, '整帧只执行一次 runtime apply（重建曲线 1 次）');
  assert.equal(counters.detachFnCurve, 1, '整帧只执行一次旧曲线卸载');
  assert.equal(store.getDocument().functions[0].coeffs.a, 200, '最终文档用该帧最后一个值');
  assert.equal(history.canUndo(), true, '手势形成一条 history');

  // undo 一次后应回到手势前（恰好一条记录 → 栈清空）
  assert.equal(history.undo(), true);
  assert.equal(history.canUndo(), false, '一次手势只形成一条 history');
  assert.deepEqual(
    store.getDocument().functions[0].coeffs,
    beforeCoeffs,
    'undo 后文档回到手势前',
  );
});

test('store transaction preview 同步投影（合同边界）：commit 不重复 apply 最终 preview', async () => {
  // 合同：Store 层 transaction 每次 preview dispatch 同步 beforeCommit（Task 3 状态机，
  // lastAppliedDocument 逐次推进）；每帧一次的运行时合并属于 UI intent 层
  // （setCoeffs frame batching，见「同帧 100 次 coefficient input」测试）。这里固定
  // Store 层语义：同步 apply + commit 跳过已 apply 的最终 preview。
  const { store, counters, mount, dispatchOk } = await setup();
  mount();
  const historyMod = await historyModule();
  const history = historyMod.createGraphHistory(store);

  store.beginTransaction();
  for (let i = 1; i <= 100; i += 1) {
    dispatchOk({
      type: 'function/update',
      payload: { id: 'f1', patch: { coeffs: { a: i, b: 0, c: 0 } } },
    });
  }
  const applyDuringPreview = counters.createFnCurve;
  assert.equal(applyDuringPreview, 100, 'Store 层 preview 每次同步投影（同步语义合同）');
  store.commitTransaction();
  assert.equal(
    counters.createFnCurve,
    applyDuringPreview,
    'commit 不重复 apply 已成功的最终 preview',
  );
  assert.equal(store.getDocument().functions[0].coeffs.a, 100, '最终文档用最后一个值');
  assert.equal(history.canUndo(), true);
  assert.equal(history.undo(), true);
  assert.equal(history.canUndo(), false, '一次手势只形成一条 history');
});

test('UI intent 层 frame batching 是高频入口的唯一路径（结构合同）', async () => {
  // 产品高频入口（滑杆/数字输入）只能经过 setCoeffs 的 frame batching：
  // mount controller 持有 pendingCoeff/coeffFrame 与 requestAnimationFrame 合并。
  const { mountSrc } = await setup();
  assert.match(mountSrc, /pendingCoeff/);
  assert.match(mountSrc, /coeffFrame/);
  assert.match(mountSrc, /requestAnimationFrame\(flushCoeffFrame\)/);
  // 函数面板的数字输入也走 setCoeffs（mount deps），不允许直连 store dispatch
  assert.match(mountSrc, /setCoeffs/);
});

// ───────────────────────── 不变量 2：point move 零函数重建 ─────────────────────────

test('point coordinate update → 0 次 function create/remove', async () => {
  const { store, counters, mount, dispatchOk } = await setup();
  mount();
  dispatchOk({ type: 'point/add', payload: { point: freePoint('U1', 0, 0) } });
  counters.reset();

  const result = dispatchOk({
    type: 'point/update',
    payload: { id: 'U1', patch: { x: 1.5, y: -2 } },
  });
  assert.equal(result.ok, true);
  assert.equal(counters.createFnCurve, 0, 'point move 不重建函数曲线');
  assert.equal(counters.detachFnCurve, 0, 'point move 不卸载函数曲线');
  assert.deepEqual(counters.createdFnIds, []);
  assert.deepEqual(counters.detachedFnIds, []);
  assert.equal(counters.pointUpdate, 1, '只有被移动的点走 pointLayer.update');
});

// ───────────────────────── 不变量：只更新 active 函数及其依赖 ─────────────────────────

test('coefficient 更新只重建 active 函数及其依赖；无关函数/点/构造计数为 0', async () => {
  const { store, counters, mount, dispatchOk } = await setup();
  const depPlanMod = await dependencyPlanModule();
  mount();

  // 文档：f1(active)、f2(无关)、U1(free)、Uv(followFunction f1)、C1(segment U1→Uv)
  dispatchOk({ type: 'function/add', payload: { function: fn('f2', { name: 'f2' }) } });
  dispatchOk({ type: 'point/add', payload: { point: freePoint('U1', 0, 0) } });
  dispatchOk({
    type: 'point/add',
    payload: {
      point: {
        id: 'Uv',
        x: 0.5,
        y: 0.25,
        constraint: { kind: 'followFunction', functionId: 'f1' },
      },
    },
  });
  dispatchOk({
    type: 'construction/add',
    payload: { construction: { id: 'C1', kind: 'segment', pointIds: ['U1', 'Uv'] } },
  });

  // 生产依赖闭包：f1 的传递下游 = Uv → C1
  const closure = depPlanMod.graphDependentsOf(store.getDocument(), ['f1']);
  assert.ok(closure.pointIds.includes('Uv'), `closure.pointIds: ${JSON.stringify(closure)}`);
  assert.ok(
    closure.constructionIds.includes('C1'),
    `closure.constructionIds: ${JSON.stringify(closure)}`,
  );

  counters.reset();
  dispatchOk({
    type: 'function/update',
    payload: { id: 'f1', patch: { coeffs: { a: 3, b: 1, c: -2 } } },
  });

  // 只重建被更新的 f1 曲线
  assert.equal(counters.createFnCurve, 1);
  assert.equal(counters.detachFnCurve, 1);
  assert.deepEqual(counters.createdFnIds, ['f1'], '无关函数 f2 不被重建');
  assert.deepEqual(counters.detachedFnIds, ['f1'], '无关函数 f2 不被卸载');
  // 依赖刷新走传递闭包：Uv(followFunction) 与 C1(segment U1→Uv) 各拆除/重建一次
  assert.equal(counters.pointRemove, 1, 'Uv 被拆除');
  assert.equal(counters.pointAdd, 1, 'Uv 按文档重建');
  assert.equal(counters.constrRemove, 1, 'C1 被拆除');
  assert.equal(counters.constrAdd, 1, 'C1 按文档重建');
  assert.equal(counters.pointUpdate, 0);
  assert.equal(counters.constrUpdate, 0);
  // 无关对象（f2 曲线、U1 自由点）零接触
  assert.equal(counters.createdFnIds.filter((id) => id !== 'f1').length, 0);
  assert.equal(counters.detachedFnIds.filter((id) => id !== 'f1').length, 0);
});

// ───────────────────────── 不变量 3：函数列表渲染条件 ─────────────────────────

test('函数列表在集合/顺序/名称/颜色/显隐/锁定/选中态变化时 render（每次恰 1 次）', async () => {
  const { store, counters, mount, dispatchOk } = await setup();
  mount();
  dispatchOk({ type: 'function/add', payload: { function: fn('f2', { name: 'f2' }) } });

  const scenarios = [
    ['集合变化 function/add', () =>
      dispatchOk({ type: 'function/add', payload: { function: fn('f3', { name: 'f3' }) } })],
    ['顺序变化 function/reorder', () =>
      dispatchOk({ type: 'function/reorder', payload: { ids: ['f2', 'f1', 'f3'] } })],
    ['名称变化', () =>
      dispatchOk({ type: 'function/update', payload: { id: 'f1', patch: { name: 'y=x^2' } } })],
    ['颜色变化', () =>
      dispatchOk({ type: 'function/update', payload: { id: 'f1', patch: { colorSlot: 2 } } })],
    ['显隐变化', () =>
      dispatchOk({ type: 'function/update', payload: { id: 'f1', patch: { visible: false } } })],
    ['锁定变化', () =>
      dispatchOk({ type: 'function/update', payload: { id: 'f1', patch: { locked: true } } })],
    // 选中态：activeFunctionId 是卡片 is-active 遮罩的数据源，切换必须重渲染列表
    ['选中变化', () =>
      dispatchOk({ type: 'presentation/update', payload: { patch: { activeFunctionId: 'f2' } } })],
  ];
  for (const [label, act] of scenarios) {
    counters.reset();
    act();
    assert.equal(counters.renderFnList, 1, `${label} → 函数列表 render 1 次`);
  }
});

test('只改 coeffs → 函数列表 render 0 次', async () => {
    const { store, counters, mount, dispatchOk } = await setup();
    mount();
    counters.reset();
    dispatchOk({
      type: 'function/update',
      payload: { id: 'f1', patch: { coeffs: { a: 9, b: 0, c: 0 } } },
    });
    assert.equal(counters.renderFnList, 0, '只改系数不重绘函数列表');
  },
);

// ───────────────────────── 不变量 4：值表/特征渲染条件 ─────────────────────────

test('值表/特征在 active function 数学定义或 active id 变化时 render', async () => {
  const { store, counters, mount, dispatchOk } = await setup();
  mount();

  // active(f1) 数学定义变化 → 刷新读数与特征
  counters.reset();
  dispatchOk({
    type: 'function/update',
    payload: { id: 'f1', patch: { coeffs: { a: 2, b: 0, c: 0 } } },
  });
  assert.equal(counters.paintReadouts, 1, 'active 函数数学定义变化 → 值表/特征刷新 1 次');
  assert.equal(counters.refreshActiveMarks, 1, '系数变化刷新特征点/渐近线（Task 6 合同）');

  // active id 变化（add 默认切换 active）→ 刷新读数与特征
  counters.reset();
  dispatchOk({ type: 'function/add', payload: { function: fn('f2', { name: 'f2' }) } });
  assert.equal(counters.paintReadouts, 1, 'active id 变化 → 值表/特征刷新 1 次');
  assert.equal(counters.refreshActiveMarks, 1, 'active id 变化 → 特征点刷新 1 次');

  // 显式切回 f1 → 刷新
  counters.reset();
  dispatchOk({ type: 'presentation/update', payload: { patch: { activeFunctionId: 'f1' } } });
  assert.equal(counters.paintReadouts, 1, 'active id 显式切换 → 值表/特征刷新 1 次');
  assert.equal(counters.refreshActiveMarks, 1);
});

test('只改 inactive 函数 coeffs → 值表/特征 render 0 次', async () => {
    const { store, counters, mount, dispatchOk } = await setup();
    mount();
    dispatchOk({ type: 'function/add', payload: { function: fn('f2', { name: 'f2' }) } });
    counters.reset();
    // f1 已非 active；改 f1 系数不该触碰值表/特征
    dispatchOk({
      type: 'function/update',
      payload: { id: 'f1', patch: { coeffs: { a: 7, b: 0, c: 0 } } },
    });
    assert.equal(counters.paintReadouts, 0, 'inactive 函数系数变化不刷新值表/特征');
  },
);

// ───────────────────────── 不变量 5：point move 不重绘列表和值表 ─────────────────────────

test('point move 不重绘函数列表和值表', async () => {
    const { store, counters, mount, dispatchOk } = await setup();
    mount();
    dispatchOk({ type: 'point/add', payload: { point: freePoint('U1', 0, 0) } });
    counters.reset();
    dispatchOk({ type: 'point/update', payload: { id: 'U1', patch: { x: 3, y: 4 } } });
    assert.equal(counters.renderFnList, 0, 'point move 不重绘函数列表');
    assert.equal(counters.paintReadouts, 0, 'point move 不重绘值表/特征');
  },
);

// ───────────────────────── 帧任务生命周期 ─────────────────────────

test('frame-task 取消后无 pending frame；多次 schedule 同帧只执行一次', async () => {
  const frameMod = await frameTaskModule();
  const scheduler = createFakeFrameScheduler();
  let flushed = 0;
  const frameTask = frameMod.createFrameTask(
    () => {
      flushed += 1;
    },
    { requestFrame: scheduler.requestFrame, cancelFrame: scheduler.cancelFrame },
  );

  frameTask.schedule();
  assert.equal(scheduler.pending(), true);
  frameTask.cancel();
  assert.equal(scheduler.pending(), false, 'cancel 后无 pending frame');
  scheduler.runFrame();
  assert.equal(flushed, 0, 'cancel 后帧回调不再执行');

  frameTask.schedule();
  frameTask.schedule();
  frameTask.schedule();
  assert.equal(scheduler.pending(), true, '多次 schedule 只登记一个 frame');
  scheduler.runFrame();
  assert.equal(flushed, 1, '同帧多次 schedule 只执行一次 task');
});

// ═══════════════════════════════════════════════════════════════════════════
// 数值分析（numeric-analysis-runner）：取消、缓存命中、stale 丢弃与求值预算。
// 该节内容早于 Task 7（commit 6b3dcf0 放入本文件），保留以避免丢回归覆盖。
// ═══════════════════════════════════════════════════════════════════════════

async function runnerModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/numeric-analysis-runner.js')).href,
  );
}

function makeScheduler() {
  const queue = [];
  return {
    queue,
    requestIdleCallback: (fn) => {
      queue.push(fn);
      return queue.length;
    },
    cancelIdleCallback: () => {},
    runNext() {
      const fn = queue.shift();
      if (fn) fn();
    },
  };
}

test('cache hit returns without re-evaluating', async () => {
  const { createNumericAnalysisRunner, analysisCacheKey } = await runnerModule();
  const scheduler = makeScheduler();
  const runner = createNumericAnalysisRunner({
    requestIdleCallback: scheduler.requestIdleCallback,
    cancelIdleCallback: scheduler.cancelIdleCallback,
  });
  let evaluations = 0;
  const record = { id: 'f1', kind: 'custom', expr: 'x^2-1' };
  const results = [];
  const run = (onResult) =>
    runner.analyze({
      record,
      interval: [-3, 3],
      resolveEvaluator: () => (x) => {
        evaluations += 1;
        return x * x - 1;
      },
      onResult,
    });
  run((r, meta) => results.push({ cached: meta.cached, zeros: r.result?.zeros?.length }));
  scheduler.runNext();
  assert.equal(results.length, 1);
  assert.equal(results[0].cached, false);
  const firstEvaluations = evaluations;

  run((r, meta) => results.push({ cached: meta.cached, zeros: r.result?.zeros?.length }));
  scheduler.runNext();
  assert.equal(results.length, 2);
  assert.equal(results[1].cached, true, 'second call is a cache hit');
  assert.equal(evaluations, firstEvaluations, 'cache hit must not re-evaluate');
  assert.ok(analysisCacheKey(record, [-3, 3], 1e-4).includes('x^2-1'));
});

test('cancelled requests do not publish', async () => {
  const { createNumericAnalysisRunner } = await runnerModule();
  const scheduler = makeScheduler();
  const runner = createNumericAnalysisRunner({
    requestIdleCallback: scheduler.requestIdleCallback,
    cancelIdleCallback: scheduler.cancelIdleCallback,
  });
  const results = [];
  const cancel = runner.analyze({
    record: { id: 'f1', kind: 'custom', expr: 'x' },
    interval: [-3, 3],
    resolveEvaluator: () => (x) => x,
    onResult: (r, meta) => results.push({ r, meta }),
  });
  cancel();
  scheduler.runNext();
  assert.equal(results.length, 0, 'cancelled analysis never publishes');
});

test('invalidated requests never publish (stale protection)', async () => {
  const { createNumericAnalysisRunner } = await runnerModule();
  const scheduler = makeScheduler();
  const runner = createNumericAnalysisRunner({
    requestIdleCallback: scheduler.requestIdleCallback,
    cancelIdleCallback: scheduler.cancelIdleCallback,
  });
  const results = [];
  const record = { id: 'f1', kind: 'custom', expr: 'x' };
  const cancel = runner.analyze({
    record,
    interval: [-3, 3],
    resolveEvaluator: () => (x) => x,
    onResult: (r, meta) => results.push(['first', meta.cached]),
  });
  // 函数定义变化 → 取消旧请求（等价于函数/视口变化时取消旧 request）
  cancel();
  scheduler.runNext();
  assert.equal(results.length, 0, 'cancelled/invalidated request never publishes');

  // 同一 key 的重复请求不重复调度（等前一个结果即可）
  const second = [];
  const { analysisCacheKey } = await runnerModule();
  const key = analysisCacheKey(record, [-3, 3], 1e-4);
  runner.invalidateKey(key);
  runner.analyze({
    record,
    interval: [-3, 3],
    resolveEvaluator: () => (x) => x,
    onResult: (r, meta) => second.push(meta.cached),
  });
  const dupe = runner.analyze({
    record,
    interval: [-3, 3],
    resolveEvaluator: () => (x) => x,
    onResult: (r, meta) => second.push(meta.cached),
  });
  assert.equal(typeof dupe, 'function', 'duplicate request returns a cancel fn');
  scheduler.runNext();
  scheduler.runNext();
  assert.equal(second.filter((c) => c === false).length, 1, 'one real computation, one share');
});

test('single active function analysis stays within the evaluation budget', async () => {
  const { createNumericAnalysisRunner } = await runnerModule();
  const runner = createNumericAnalysisRunner({});
  let evaluations = 0;
  const results = [];
  runner.analyze({
    record: { id: 'f1', kind: 'custom', expr: 'x^3 - 2x + 1' },
    interval: [-10, 10],
    resolveEvaluator: () => (x) => {
      evaluations += 1;
      return x * x * x - 2 * x + 1;
    },
    onResult: (r) => results.push(r),
  });
  // 无 ric/setTimeout 注入 → setTimeout 兜底；手动等一个宏任务
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(results.length, 1);
  assert.ok(evaluations <= 5000, `evaluations ${evaluations} within budget`);
  assert.equal(results[0].result.warnings.includes('NUMERIC_APPROXIMATION'), true);
});

test('clear drops cache and pending', async () => {
  const { createNumericAnalysisRunner } = await runnerModule();
  const runner = createNumericAnalysisRunner({});
  const results = [];
  runner.analyze({
    record: { id: 'f1', kind: 'custom', expr: 'x' },
    interval: [-3, 3],
    resolveEvaluator: () => (x) => x,
    onResult: (r, meta) => results.push(meta),
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(runner.stats().cacheSize, 1);
  runner.clear();
  assert.equal(runner.stats().cacheSize, 0);
});
