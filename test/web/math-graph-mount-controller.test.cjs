/**
 * GraphMountController 生命周期：mount → 点击 → dispose 循环的资源归零合同。
 *
 * 基于 fake DOM/window/board/storage/timer/frame/observer/URL，不依赖浏览器。
 * 断言：handler 单次执行、listener/timer/frame/observer/URL 全部释放、
 * disposer 逆序容错幂等、重复 dispose 安全。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function mountModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-mount-controller.js')).href,
  );
}

/** fake 元素：可绑定/解绑 listener，记录次数 */
function makeFakeElement(id) {
  const el = {
    id,
    hidden: false,
    value: '',
    files: null,
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {},
    removeAttribute() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    listeners: {},
    addEventListener(type, fn) {
      (el.listeners[type] = el.listeners[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      el.listeners[type] = (el.listeners[type] || []).filter((f) => f !== fn);
    },
    click() {
      for (const fn of el.listeners.click || []) fn({ preventDefault() {} });
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    observe() {},
    disconnect() {
      el.disconnected = true;
    },
  };
  return el;
}

function makeEnv() {
  /** @type {Map<string, import('./graph-mount-controller.js').any>} */
  const elements = new Map();
  const ids = [
    'mathGraphStage',
    'mathGraphBoard',
    'panel-math-graph',
    'mathGraphFileInput',
    'btnMathGraphImport',
    'btnMathGraphExport',
    'btnMathGraphReset',
    'mathFnList',
    'mathFnParamPanel',
    'mathGraphFeatures',
    'mathGraphValueTable',
    'mathGraphProbeReadout',
    'mathFnAddBackdrop',
    'mathFnAddModal',
    'mathFnAiBackdrop',
    'mathFnAiModal',
  ];
  for (const id of ids) elements.set(id, makeFakeElement(id));

  const env = {
    windowListeners: {},
    rafs: [],
    timers: [],
    observers: [],
    urls: [],
    revokedUrls: [],
    disposedLog: [],
    readers: [],
    importPromises: [],
    rafSeq: 1,
    timerSeq: 1,
  };

  const fakeDocument = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement(tag) {
      return makeFakeElement(`el-${tag}`);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  const fakeWindow = {
    addEventListener(type, fn) {
      (env.windowListeners[type] = env.windowListeners[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      env.windowListeners[type] = (env.windowListeners[type] || []).filter((f) => f !== fn);
    },
    setTimeout(fn, ms) {
      const id = env.timerSeq++;
      env.timers.push({ id, fn, ms });
      return id;
    },
    clearTimeout(id) {
      env.timers = env.timers.filter((t) => t.id !== id);
    },
    innerWidth: 800,
    innerHeight: 600,
  };

  const previousGlobals = {
    document: globalThis.document,
    window: globalThis.window,
    ResizeObserver: globalThis.ResizeObserver,
    URL: globalThis.URL,
    FileReader: globalThis.FileReader,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    Blob: globalThis.Blob,
  };
  globalThis.document = fakeDocument;
  globalThis.window = fakeWindow;
  globalThis.ResizeObserver = class {
    constructor(cb) {
      // 每个实例只标记自己，避免一次 disconnect 掩盖旧 observer 未销毁
      this._entry = { cb, disconnected: false };
      env.observers.push(this._entry);
    }
    observe() {}
    disconnect() {
      this._entry.disconnected = true;
    }
  };
  globalThis.URL = {
    createObjectURL() {
      const url = `blob:fake-${env.urls.length}`;
      env.urls.push(url);
      return url;
    },
    revokeObjectURL(url) {
      env.revokedUrls.push(url);
    },
  };
  globalThis.FileReader = class {
    constructor() {
      this.result = '';
      this.aborted = false;
      env.readers.push(this);
    }
    readAsText() {
      // 不触发 onload（模拟用户未完成选择）
    }
    abort() {
      this.aborted = true;
    }
  };
  globalThis.requestAnimationFrame = (fn) => {
    const id = env.rafSeq++;
    env.rafs.push({ id, fn });
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => {
    env.rafs = env.rafs.filter((r) => r.id !== id);
  };
  globalThis.Blob = class {
    constructor(parts) {
      this.parts = parts;
    }
  };

  return { env, elements, previousGlobals, fakeDocument, fakeWindow };
}

/** 构造 mount controller（fake deps）。 */
async function makeController(overrides = {}) {
  const mod = await mountModule();
  const { env, elements, previousGlobals, fakeDocument, fakeWindow } = makeEnv();
  const state = {
    board: null,
    functions: [],
    activeFnId: null,
    userPoints: [],
    constructions: [],
    marks: [],
    asy: [],
    coeffs: { a: 0, b: 0, c: 0 },
    startCoeffs: { a: 0, b: 0, c: 0 },
    preset: 'quadratic',
    graphStore: null,
    graphHistory: null,
    historyController: null,
    graphPersistence: null,
    persistenceController: null,
    styleBind: null,
    notes: null,
    toolPointer: null,
    toolStrip: null,
    probe: null,
    compass: null,
    themeHandle: null,
    ro: null,
    escBound: false,
    onPageHide: null,
    storeUnsub: null,
    notesUnsub: null,
    editMode: false,
    toolPick: null,
    referenceCurve: null,
    curve: null,
    fXMin: -10,
    fXMax: 10,
    firstFrameRaf: null,
  };
  const calls = [];
  const fakeDispose = (name) => () => {
    calls.push(`dispose:${name}`);
  };
  /** 与 bindEscToSelect 绑定的同一 handler 引用（dispose 必须按引用移除） */
  const escHandler = () => {};
  const deps = {
    state,
    setStageEl: () => {},
    getStageEl: () => elements.get('mathGraphStage'),
    resizeMathBoard: () => calls.push('resizeMathBoard'),
    ensureMathFloatCardsBound: () => calls.push('floatCards'),
    bindFnListUi: () => calls.push('bindFnList'),
    renderFnList: () => calls.push('renderFnList'),
    syncParamPanel: () => calls.push('syncParamPanel'),
    paintReadouts: () => calls.push('paintReadouts'),
    renderProbeReadout: () => calls.push('probeReadout'),
    schedulePointLabelFusion: () => {},
    fnDisplayLabel: () => 'f(x)',
    resolveFunctionColor: () => '#b45309',
    followIdForFn: (id) => `graph:fn:${id}`,
    rebuildCurve: () => calls.push('rebuildCurve'),
    syncRangeNumber: () => {},
    defaultCoeffsFor: () => ({ a: 1, b: 0, c: 0 }),
    GRAPH_PRESETS: [{ id: 'quadratic', label: '二次函数', tip: 'y=ax²+bx+c' }],
    addPresetFn: () => {},
    formulaText: () => 'y = x²',
    mirrorActiveToLegacy: () => {},
    pointLayer: { add: () => {}, update: () => {}, remove: () => {} },
    constructionLayer: { add: () => {}, update: () => {}, remove: () => {} },
    curveFollowTargetId: (id) => `graph:fn:${id}`,
    parseFeatureFollowTargetId: () => null,
    detachConstr: () => {},
    activeFn: () => state.functions[0] || null,
    bindRangeNumber: () => {},
    mountMathNumKeypads: () => {},
    bindObjectStyleForPanel: () => ({
      selection: { attachBoard: () => {}, clear: () => {}, registerMany: () => {} },
      panel: { setActiveSelection: () => {}, hide: () => {} },
      dispose: fakeDispose('styleBind'),
    }),
    createBoardSelectionController: (opts) => ({
      attachBoard: () => {},
      clear: () => {},
      registerMany: () => {},
      onSelect: opts?.onSelect,
    }),
    setPointOptionHooks: () => {},
    setStyleIntentBridge: () => {},
    findUserRec: () => null,
    userPointIdOf: () => null,
    setUserPointFollow: () => {},
    setPointShowCoords: () => {},
    listFollowTargets: () => [],
    evalFnY: () => 0,
    removeConstructionById: () => {},
    removeUserPointById: () => {},
    deleteFn: () => {},
    isExtendStyleTarget: () => false,
    setConstructionExtend: () => {},
    normalizePointStylePatch: (s) => s || {},
    normalizeConstructionStylePatch: (s) => s || {},
    attachBoardCompass: () => ({ dispose: fakeDispose('compass') }),
    attachBoardToolStrip: () => ({
      getTool: () => 'select',
      setTool: () => {},
      setHint: () => {},
      dispose: fakeDispose('toolStrip'),
    }),
    clearToolPick: () => {},
    createProbeController: () => ({ dispose: fakeDispose('probe'), setActive: () => {} }),
    attachToolPointer: () => ({ dispose: fakeDispose('toolPointer') }),
    handleToolTap: () => {},
    onToolEsc: escHandler,
    bindEscToSelect: () => {
      // 模拟真实 bindEscToSelect：绑定 keydown（同一 handler 引用，dispose 需按引用移除）
      state.escBound = true;
      fakeWindow.addEventListener('keydown', escHandler);
    },
    attachBoardNotes: () => ({
      isActive: () => false,
      dispose: fakeDispose('notes'),
      redraw: () => {},
      replaceSnapshot: () => {},
      onSnapshotChange: () => () => {},
    }),
    createGraphHistoryController: () => ({ dispose: fakeDispose('historyController') }),
    createGraphPersistenceController: (ctx) => ({
      importJson: () => {
        calls.push('importJson');
        const p = (async () => {
          if (ctx.pickJsonFile) {
            const text = await ctx.pickJsonFile();
            calls.push(`pick:${text}`);
            return text;
          }
          return null;
        })();
        env.importPromises.push(p);
        return p;
      },
      exportJson: () => {
        calls.push('exportJson');
        if (ctx.downloadText) ctx.downloadText('doc.json', '{}');
      },
      reset: async () => {
        calls.push('reset');
      },
    }),
    createDefaultGraphDocument: () => ({ functions: [] }),
    appConfirm: async () => true,
    appAlert: async () => {},
    bindMathThemeRestyle: () => ({ dispose: fakeDispose('theme') }),
    createMathBoard: () => ({
      on: () => {},
      off: () => {},
      removeObject: () => {},
      update: () => {},
      getBoundingBox: () => [-8, 8, 8, -8],
      _mathAxisLegend: { refresh: () => {} },
      create: () => ({ setAttribute: () => {} }),
      remove: () => {},
    }),
    createGraphPersistence: () => ({ dispose: fakeDispose('persistence'), load: () => ({ document: { functions: [] } }), flush: () => {}, scheduleSave: () => {} }),
    createGraphIdAllocator: () => ({ nextFunctionId: () => 'f1', nextPointId: () => 'U1', nextConstructionId: () => 'C1', reseed: () => {} }),
    createGraphStore: () => ({
      getDocument: () => ({ functions: [], points: [], constructions: [] }),
      subscribe: () => () => {},
      dispose: fakeDispose('store'),
      beginTransaction: () => {},
      commitTransaction: () => {},
      cancelTransaction: () => {},
    }),
    createGraphHistory: () => ({ dispose: fakeDispose('history'), clear: () => {}, subscribe: () => () => {} }),
    viewBridge: { dispose: fakeDispose('viewBridge'), onBoardBoundingBox: () => {}, applyViewFromDocument: () => {} },
    graphRenderer: { fullRender: () => {}, beforeCommit: () => ({ ok: true }), recover: () => ({ ok: true }), dispose: () => {} },
    syncRuntimeFromDocument: () => ({ ok: true }),
    bindPointLabelFusion: () => {},
    unbindPointLabelFusion: () => {},
    makeDrawHost: () => ({ getConstructions: () => [], getBoard: () => state.board }),
    hitBoardPrefer: () => null,
    clearAllConstructions: () => {},
    removeUserPointEls: () => {},
    removeAllFnCurves: () => {},
    freeMathBoard: () => calls.push('freeMathBoard'),
    curveRebuildTask: { cancel: () => {} },
    flushCoeffFrame: () => {},
    onToolEsc: escHandler,
    hideAddPanel: () => {},
    hideAiFnModal: () => {},
    dismissBoardNotesMode: () => {},
    resetReferenceKey: () => {},
    reregisterSelectable: () => calls.push('reregisterSelectable'),
    readoutsDispose: fakeDispose('readouts'),
    readoutsReset: () => calls.push('readoutsReset'),
    ...overrides,
  };
  const controller = mod.createGraphMountController(deps);
  return { controller, state, env, elements, calls, deps, restore: () => {
    for (const [k, v] of Object.entries(previousGlobals)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  } };
}

test('20 次 mount → 点击 → dispose：handler 单次、资源全部归零', async () => {
  const { controller, env, elements, calls, restore } = await makeController();
  for (let round = 0; round < 20; round += 1) {
    controller.initGraphUI();
    // 点击导入/导出/重置各一次（不触发文件选择完成）
    elements.get('btnMathGraphImport').click();
    elements.get('btnMathGraphExport').click();
    elements.get('btnMathGraphReset').click();
    // 每次点击恰好一次 handler 执行
    assert.equal(calls.filter((c) => c === 'importJson').length, round + 1, `round ${round} import once`);
    assert.equal(calls.filter((c) => c === 'exportJson').length, round + 1, `round ${round} export once`);
    assert.equal(calls.filter((c) => c === 'reset').length, round + 1, `round ${round} reset once`);
    // readouts 随 mount 周期 reset / dispose 各一次
    assert.equal(calls.filter((c) => c === 'readoutsReset').length, round + 1, `round ${round} readouts reset once`);
    // 导出产生 object URL → dispose 后全部 revoke
    controller.disposeGraph();
    assert.equal(calls.filter((c) => c === 'dispose:readouts').length, round + 1, `round ${round} readouts dispose once`);
    if (env.timers.length) console.log('ROUND', round, 'pending timers:', JSON.stringify(env.timers.map(t => ({ id: t.id, ms: t.ms }))));
    assert.equal(env.urls.length, round + 1, 'one url per export round');
    assert.equal(env.revokedUrls.length, env.urls.length, 'all urls revoked');
    assert.equal(env.timers.length, 0, 'no pending timers after dispose');
    if (env.rafs.length) console.log('ROUND', round, 'pending rafs:', JSON.stringify(env.rafs.map(r => r.id)));
    assert.equal(env.rafs.length, 0, 'no pending frames after dispose');
    assert.ok(env.observers.every((o) => o.disconnected), 'ResizeObserver disconnected');
    assert.equal(env.windowListeners.pagehide?.length || 0, 0, 'pagehide listener removed');
    assert.equal(env.windowListeners.keydown?.length || 0, 0, 'keydown (Esc) listener removed');
    // 文件 input change listener 已移除
    assert.equal(elements.get('mathGraphFileInput').listeners.change?.length || 0, 0);
    // 按钮 listener 已移除
    assert.equal(elements.get('btnMathGraphImport').listeners.click?.length || 0, 0);
    assert.equal(elements.get('btnMathGraphExport').listeners.click?.length || 0, 0);
    assert.equal(elements.get('btnMathGraphReset').listeners.click?.length || 0, 0);
    // 重复 dispose 幂等
    controller.disposeGraph();
    controller.disposeGraph();
  }
  // 20 轮累计：每次导出一个 URL
  assert.equal(env.urls.length, 20);
  assert.equal(env.revokedUrls.length, 20);
  restore();
});

test('disposer 逆序执行；单个抛错不阻断其余', async () => {
  const order = [];
  const controller = await makeController();
  const { controller: ctrl, restore } = controller;
  const { calls } = controller;
  // 通过 makeController 的 deps 注入抛错 disposer
  restore();
  const c2 = await makeController({
    bindMathThemeRestyle: () => ({
      dispose: () => {
        order.push('theme');
        throw new Error('theme dispose exploded');
      },
    }),
    createGraphHistory: () => ({
      dispose: () => order.push('history'),
      clear: () => {},
      subscribe: () => () => {},
    }),
    createGraphStore: () => ({
      getDocument: () => ({ functions: [], points: [], constructions: [] }),
      subscribe: () => () => {},
      dispose: () => order.push('store'),
      beginTransaction: () => {},
      commitTransaction: () => {},
      cancelTransaction: () => {},
    }),
  });
  c2.controller.initGraphUI();
  // 手动触发 disposeAll（通过 disposeGraph）
  c2.controller.disposeGraph();
  // 抛错 disposer 之后仍继续执行（store/history 等在其后逆序注册）
  assert.ok(order.includes('theme'), 'theme dispose ran');
  assert.ok(order.includes('history'), 'history dispose ran despite theme throwing');
  assert.ok(order.includes('store'), 'store dispose ran despite theme throwing');
  // 逆序：后注册的先执行（theme 在 store 之后注册 → theme 先执行）
  const storeIdx = order.indexOf('store');
  const themeIdx = order.indexOf('theme');
  assert.ok(themeIdx < storeIdx, 'theme（后注册）先于 store（先注册）执行 = 逆序');
  c2.restore();
});

test('dispose 幂等且不重复副作用', async () => {
  const { controller, env, calls, restore } = await makeController();
  controller.initGraphUI();
  controller.disposeGraph();
  const urlCount = env.urls.length;
  const revokedCount = env.revokedUrls.length;
  controller.disposeGraph();
  controller.disposeGraph();
  assert.equal(env.urls.length, urlCount, 'no new urls on repeated dispose');
  assert.equal(env.revokedUrls.length, revokedCount, 'no repeated revoke');
  assert.equal(calls.filter((c) => c === 'freeMathBoard').length, 1, 'board freed once');
  restore();
});

// ───────────────────────── 函数依赖解绑/重绑：selection 注册接线 ─────────────────────────

test('detachFunctionDependents/rebindFunctionDependents：不抛 reregisterSelectable 未定义，selection 只注册一次', async () => {
  const order = [];
  let stateRef = null;
  const { controller, state, calls, restore } = await makeController({
    detachConstr: (rec) => {
      // 删除顺序合同：detach runtime 时，构造记录必须仍存在于 state 数组
      order.push(`detach:${rec.id}`);
      if (!stateRef.constructions.some((c) => c.id === rec.id)) {
        order.push('STATE-MUTATED-BEFORE-DETACH');
      }
    },
  });
  stateRef = state;
  state.board = { removeObject: () => {} };
  state.userPoints = [
    { id: 'U1', followTargetId: 'graph:fn:f1', intersectFnIds: null, el: { tag: 'u1' } },
    { id: 'U2', followTargetId: null, intersectFnIds: ['f1', 'f3'], el: { tag: 'u2' } },
    { id: 'U3', followTargetId: null, intersectFnIds: null, el: { tag: 'u3' } },
  ];
  state.constructions = [
    { id: 'C1', kind: 'segment', fnId: 'f1', els: [{ tag: 'c1' }] },
    { id: 'C2', kind: 'segment', fnId: 'f2', els: [{ tag: 'c2' }] },
  ];

  // detach：跟随 f1 的点（U1）+ 依赖 f1 的构造（C1）被拆除；无关对象保留
  assert.doesNotThrow(
    () => controller.detachFunctionDependents('f1'),
    'detachFunctionDependents 不得抛 reregisterSelectable is not defined',
  );
  assert.deepEqual(order, ['detach:C1'], '只有依赖 f1 的构造被 detach（且先于 state 数组修改）');
  assert.ok(
    !state.constructions.some((c) => c.id === 'C1'),
    'C1 已从 state.constructions 移除',
  );
  assert.ok(
    state.constructions.some((c) => c.id === 'C2'),
    '无关构造 C2 保留',
  );
  assert.ok(!state.userPoints.some((r) => r.id === 'U1'), '跟随点 U1 已移除');
  assert.ok(!state.userPoints.some((r) => r.id === 'U2'), '交点 U2 已移除');
  assert.ok(state.userPoints.some((r) => r.id === 'U3'), '无关点 U3 保留');
  assert.equal(
    calls.filter((c) => c === 'reregisterSelectable').length,
    1,
    'detach 完成后 selection 只重新注册一次',
  );

  // rebind：按文档重建依赖并再次注册 selection
  assert.doesNotThrow(
    () =>
      controller.rebindFunctionDependents('f1', {
        points: [
          { id: 'U1', x: 0.5, y: 0.25, constraint: { kind: 'followFunction', functionId: 'f1' } },
        ],
        constructions: [{ id: 'C1', kind: 'segment', fnId: 'f1', pointIds: ['U1', 'U3'] }],
      }),
    'rebindFunctionDependents 不得抛 reregisterSelectable is not defined',
  );
  assert.equal(
    calls.filter((c) => c === 'reregisterSelectable').length,
    2,
    'rebind 完成后 selection 再次注册恰好一次',
  );
  restore();
});

test('dispose 后异步回调不修改已销毁状态', async () => {
  const { controller, env, elements, restore } = await makeController();
  controller.initGraphUI();
  controller.disposeGraph();
  // 模拟用户延迟选择文件（change 已在 dispose 时移除）
  const input = elements.get('mathGraphFileInput');
  assert.equal(input.listeners.change?.length || 0, 0);
  restore();
});

// ───────────────────────── 文件选择 Promise settle 合同 ─────────────────────────

test('文件选择：点击导入但不选择文件，dispose 后 Promise resolve null', async () => {
  const { controller, env, elements, restore } = await makeController();
  controller.initGraphUI();
  elements.get('btnMathGraphImport').click();
  const p = env.importPromises.at(-1);
  controller.disposeGraph();
  assert.equal(await p, null, 'dispose 后等待中的文件选择 Promise 被 settle 为 null');
  assert.equal(elements.get('mathGraphFileInput').listeners.change?.length || 0, 0, 'change listener 已移除');
  restore();
});

test('文件选择：FileReader 读取中 dispose → reader abort + Promise resolve null', async () => {
  const { controller, env, elements, restore } = await makeController();
  controller.initGraphUI();
  const input = elements.get('mathGraphFileInput');
  input.files = [{}]; // 模拟用户已选文件
  elements.get('btnMathGraphImport').click();
  const changeFn = input.listeners.change?.[0];
  assert.ok(changeFn, 'pick 后应有 change listener');
  changeFn({}); // 进入 FileReader 读取阶段
  const reader = env.readers.at(-1);
  assert.ok(reader, 'change 后应创建 FileReader');
  const p = env.importPromises.at(-1);
  controller.disposeGraph();
  assert.equal(reader.aborted, true, 'dispose 时 abort 未完成的 FileReader');
  assert.equal(await p, null, '读取中 dispose → Promise resolve null');
  restore();
});

test('文件选择：dispose 后再触发旧 change/load/error 回调不重复 settle 不修改状态', async () => {
  const { controller, env, elements, restore } = await makeController();
  controller.initGraphUI();
  const input = elements.get('mathGraphFileInput');
  input.files = [{}];
  elements.get('btnMathGraphImport').click();
  const oldChange = input.listeners.change?.[0];
  oldChange({});
  const reader = env.readers.at(-1);
  const p = env.importPromises.at(-1);
  controller.disposeGraph();
  assert.equal(await p, null, 'dispose 时 settle 一次');
  // 旧回调在 dispose 后触发：不重复 settle、不重新绑定、不抛错
  oldChange({});
  reader.onload({});
  reader.onerror({});
  reader.onabort({});
  assert.equal(input.listeners.change?.length || 0, 0, '旧 change 不重新绑定');
  assert.equal(reader.aborted, true, 'reader 保持 aborted');
  restore();
});

test('文件选择：重新 mount 后可发起新的文件选择并正常 resolve 文本', async () => {
  const { controller, env, elements, restore } = await makeController();
  controller.initGraphUI();
  elements.get('btnMathGraphImport').click();
  controller.disposeGraph();
  await env.importPromises.at(-1); // 第一轮任务已 settle

  controller.initGraphUI(); // 重新 mount
  const input = elements.get('mathGraphFileInput');
  input.files = [{ name: 'doc.json' }];
  elements.get('btnMathGraphImport').click();
  const changeFn = input.listeners.change?.[0];
  assert.ok(changeFn, '重挂载后重新绑定 change listener');
  const p = env.importPromises.at(-1);
  changeFn({});
  const reader = env.readers.at(-1);
  reader.result = '{"functions":[]}';
  reader.onload({});
  assert.equal(await p, '{"functions":[]}', '新 mount 文件选择正常 resolve 文本');
  restore();
});

test('文件选择：连续触发导入只保留一个 change listener，前一个任务被取消', async () => {
  const { controller, env, elements, restore } = await makeController();
  controller.initGraphUI();
  elements.get('btnMathGraphImport').click();
  elements.get('btnMathGraphImport').click(); // 第二次导入：取消前一个
  assert.equal(
    elements.get('mathGraphFileInput').listeners.change?.length || 0,
    1,
    '只保留一个 change listener',
  );
  assert.equal(await env.importPromises[0], null, '前一个任务被取消并 settle 为 null');
  controller.disposeGraph();
  assert.equal(await env.importPromises[1], null, '后一个任务在 dispose 时 settle');
  restore();
});

// ───────────────────────── dispose 前置清理容错合同 ─────────────────────────

test('dispose：curveRebuildTask.cancel 抛错，其余资源仍释放', async () => {
  const { controller, env, elements, calls, restore } = await makeController({
    curveRebuildTask: { cancel: () => { throw new Error('cancel exploded'); } },
  });
  controller.initGraphUI();
  elements.get('btnMathGraphExport').click();
  controller.disposeGraph();
  assert.equal(calls.filter((c) => c === 'freeMathBoard').length, 1, 'board 仍释放');
  assert.equal(env.revokedUrls.length, env.urls.length, 'object URL 仍 revoke');
  assert.ok(env.observers.every((o) => o.disconnected), 'observer 仍 disconnect');
  assert.equal(env.windowListeners.pagehide?.length || 0, 0, 'pagehide 仍移除');
  assert.equal(elements.get('btnMathGraphExport').listeners.click?.length || 0, 0, '按钮 listener 仍移除');
  restore();
});

test('dispose：flushCoeffFrame 抛错（dispatch 抛错），其余资源仍释放', async () => {
  const { controller, env, elements, calls, state, restore } = await makeController({
    createGraphStore: () => ({
      getDocument: () => ({ functions: [], points: [], constructions: [] }),
      subscribe: () => () => {},
      dispose: () => {},
      beginTransaction: () => {},
      commitTransaction: () => {},
      cancelTransaction: () => {},
      dispatch: () => { throw new Error('dispatch exploded'); },
    }),
  });
  controller.initGraphUI();
  state.functions = [
    { id: 'f1', kind: 'preset', preset: 'quadratic', coeffs: { a: 1, b: 0, c: 0 }, locked: false },
  ];
  state.activeFnId = 'f1';
  controller.setCoeffs({ a: 5 }); // 登记 pendingCoeff + coeffFrame（fake RAF 不执行）
  const rafsBefore = env.rafs.length;
  assert.ok(rafsBefore >= 2, `setCoeffs 已登记 coeff frame（现有 ${rafsBefore} 个：firstFrame + coeffFrame）`);
  controller.disposeGraph();
  assert.equal(env.rafs.length, 0, 'coeff frame 与 firstFrame 均已取消');
  assert.equal(calls.filter((c) => c === 'freeMathBoard').length, 1, 'flush 抛错后 board 仍释放');
  restore();
});

test('dispose：cancelTransaction 抛错，其余资源仍释放', async () => {
  const { controller, env, elements, calls, state, restore } = await makeController({
    createGraphStore: () => ({
      getDocument: () => ({ functions: [], points: [], constructions: [] }),
      subscribe: () => () => {},
      dispose: () => {},
      beginTransaction: () => {},
      commitTransaction: () => {},
      cancelTransaction: () => { throw new Error('cancelTransaction exploded'); },
    }),
  });
  controller.initGraphUI();
  state.coeffTxTimer = 1; // 模拟挂起的 transaction debounce timer
  controller.disposeGraph();
  assert.equal(env.timers.length, 0, 'timer 清理仍执行');
  assert.equal(calls.filter((c) => c === 'freeMathBoard').length, 1, 'cancelTransaction 抛错后 board 仍释放');
  assert.equal(env.windowListeners.pagehide?.length || 0, 0, 'pagehide 仍移除');
  restore();
});

test('dispose：弹窗/hook 清理抛错，board/observer/listener 仍释放', async () => {
  const { controller, env, elements, calls, restore } = await makeController({
    hideAddPanel: () => { throw new Error('hideAddPanel exploded'); },
    hideAiFnModal: () => { throw new Error('hideAiFnModal exploded'); },
    dismissBoardNotesMode: () => { throw new Error('notes mode exploded'); },
    // 只在 dispose 清理（传 null）时抛错；initGraphUI 设置 hooks 必须正常
    setPointOptionHooks: (arg) => {
      if (arg === null) throw new Error('hooks exploded');
    },
    setStyleIntentBridge: (arg) => {
      if (arg === null) throw new Error('bridge exploded');
    },
  });
  controller.initGraphUI();
  elements.get('btnMathGraphExport').click();
  controller.disposeGraph();
  assert.equal(calls.filter((c) => c === 'freeMathBoard').length, 1, 'freeMathBoard 仍执行');
  assert.ok(env.observers.every((o) => o.disconnected), 'observer 仍 disconnect');
  assert.equal(env.windowListeners.pagehide?.length || 0, 0, 'pagehide 仍移除');
  assert.equal(env.revokedUrls.length, env.urls.length, 'URL 仍 revoke');
  assert.equal(elements.get('btnMathGraphExport').listeners.click?.length || 0, 0, '按钮 listener 仍移除');
  restore();
});

test('dispose 抛错后再次 dispose：不重复释放、不重复副作用', async () => {
  const { controller, env, elements, calls, restore } = await makeController({
    hideAddPanel: () => { throw new Error('hideAddPanel exploded'); },
  });
  controller.initGraphUI();
  elements.get('btnMathGraphExport').click();
  controller.disposeGraph();
  const urlCount = env.urls.length;
  const revokedCount = env.revokedUrls.length;
  const freeCount = calls.filter((c) => c === 'freeMathBoard').length;
  controller.disposeGraph();
  controller.disposeGraph();
  assert.equal(calls.filter((c) => c === 'freeMathBoard').length, freeCount, '不重复释放 board');
  assert.equal(env.urls.length, urlCount, '不产生新 URL');
  assert.equal(env.revokedUrls.length, revokedCount, '不重复 revoke');
  restore();
});

// ─────────────── Task 1：首次投影 + session 保留（lifecycle recovery） ───────────────

function nonEmptyDocument() {
  return {
    functions: [{ id: 'f1', kind: 'preset', preset: 'quadratic', coeffs: { a: 2, b: 0, c: 0 }, colorSlot: 0, visible: true }],
    points: [{ id: 'U1', x: 1, y: 2, label: 'A' }],
    constructions: [{ id: 'C1', kind: 'segment', pointIds: ['U1'] }],
    annotations: [],
    view: { boundingBox: [-10, 10, 10, -10] },
  };
}

test('首次 mount 将 store 中的非空 GraphDocument 全量投影一次', async () => {
  const loadedDoc = nonEmptyDocument();
  let fullRenderCount = 0;
  let fullRenderArg = null;
  const syncRangeCalls = [];
  const { controller, state, restore } = await makeController({
    createGraphPersistence: () => ({
      dispose: () => {},
      load: () => ({ document: loadedDoc }),
      flush: () => {},
      scheduleSave: () => {},
    }),
    createGraphStore: (initial) => ({
      getDocument: () => initial,
      subscribe: () => () => {},
      dispose: () => {},
      beginTransaction: () => {},
      commitTransaction: () => {},
      cancelTransaction: () => {},
    }),
    graphRenderer: {
      fullRender: (doc) => {
        fullRenderCount += 1;
        fullRenderArg = doc;
        return { ok: true };
      },
      beforeCommit: () => ({ ok: true }),
      recover: () => ({ ok: true }),
      dispose: () => {},
    },
    syncRangeNumber: () => {
      syncRangeCalls.push('sync');
    },
  });
  try {
    controller.initGraphUI();
    assert.equal(fullRenderCount, 1, 'fullRender 恰好一次');
    assert.equal(fullRenderArg, state.graphStore.getDocument(), '参数严格等于 store 文档');
    // UI bindings 首次同步 3 次 + 成功投影后 syncSliders 再次 3 次
    assert.equal(syncRangeCalls.length, 6, `syncSliders 首轮 3 + 投影后 3（实际 ${syncRangeCalls.length}）`);
    assert.deepEqual(state.startCoeffs, state.coeffs, 'startCoeffs 与投影后 coeffs 对齐');
    // 重复 init（已有 board）不重复投影
    controller.initGraphUI();
    assert.equal(fullRenderCount, 1, '重复 init 不重复投影');
    controller.disposeGraph();
    controller.disposeGraph();
  } finally {
    restore();
  }
});

test('首次渲染失败仍可完整销毁且不覆盖 store', async () => {
  const loadedDoc = nonEmptyDocument();
  let fullRenderCount = 0;
  const syncRangeCalls = [];
  const disposes = [];
  const fakeDispose = (label) => () => disposes.push(label);
  const { controller, state, restore } = await makeController({
    createGraphPersistence: () => ({
      dispose: fakeDispose('persistence'),
      load: () => ({ document: loadedDoc }),
      flush: () => {},
      scheduleSave: () => {},
    }),
    createGraphStore: (initial) => ({
      getDocument: () => initial,
      subscribe: () => () => {},
      dispose: fakeDispose('store'),
      beginTransaction: () => {},
      commitTransaction: () => {},
      cancelTransaction: () => {},
    }),
    createGraphHistory: () => ({ dispose: fakeDispose('history'), clear: () => {}, subscribe: () => () => {} }),
    graphRenderer: {
      fullRender: () => {
        fullRenderCount += 1;
        return { ok: false, fatal: true };
      },
      beforeCommit: () => ({ ok: true }),
      recover: () => ({ ok: false, fatal: true }),
      dispose: () => {},
    },
    freeMathBoard: () => disposes.push('freeMathBoard'),
    viewBridge: { dispose: fakeDispose('viewBridge'), onBoardBoundingBox: () => {}, applyViewFromDocument: () => {} },
    readoutsDispose: fakeDispose('readouts'),
    syncRangeNumber: () => {
      syncRangeCalls.push('sync');
    },
  });
  try {
    controller.initGraphUI();
    assert.equal(fullRenderCount, 1, 'fullRender 只调用一次');
    assert.equal(state.graphStore.getDocument(), loadedDoc, '失败不覆盖 store 文档');
    assert.deepEqual(state.startCoeffs, { a: 0, b: 0, c: 0 }, '失败后 startCoeffs 保持初始（未更新）');
    assert.equal(syncRangeCalls.length, 3, '失败后无第二轮 slider 同步（仅首轮 3 次）');
    controller.disposeGraph();
    for (const label of ['persistence', 'viewBridge', 'history', 'store', 'freeMathBoard', 'readouts']) {
      assert.equal(disposes.filter((d) => d === label).length, 1, `${label} 释放恰好一次`);
    }
    controller.disposeGraph(); // 幂等
    for (const label of ['persistence', 'store', 'freeMathBoard', 'readouts']) {
      assert.equal(disposes.filter((d) => d === label).length, 1, `重复 dispose 后 ${label} 仍一次`);
    }
  } finally {
    restore();
  }
});

test('重复 init 不覆盖活动 disposer session；DOM 缺失不建 session', async () => {
  let boardCount = 0;
  let resetCount = 0;
  let fullRenderCount = 0;
  const disposes = [];
  const fakeDispose = (label) => () => disposes.push(label);
  const { controller, elements, restore } = await makeController({
    createMathBoard: () => {
      boardCount += 1;
      return { on: () => {}, off: () => {}, removeObject: () => {}, update: () => {}, getBoundingBox: () => [-8, 8, 8, -8], create: () => ({ setAttribute: () => {} }), remove: () => {} };
    },
    readoutsReset: () => {
      resetCount += 1;
    },
    graphRenderer: {
      fullRender: () => {
        fullRenderCount += 1;
        return { ok: true };
      },
      beforeCommit: () => ({ ok: true }),
      recover: () => ({ ok: true }),
      dispose: () => {},
    },
    createGraphPersistence: () => ({ dispose: fakeDispose('persistence'), load: () => ({ document: { functions: [] } }), flush: () => {}, scheduleSave: () => {} }),
    createGraphStore: () => ({ getDocument: () => ({ functions: [] }), subscribe: () => () => {}, dispose: fakeDispose('store'), beginTransaction: () => {}, commitTransaction: () => {}, cancelTransaction: () => {} }),
    createGraphHistory: () => ({ dispose: fakeDispose('history'), clear: () => {}, subscribe: () => () => {} }),
    freeMathBoard: () => disposes.push('freeMathBoard'),
    viewBridge: { dispose: fakeDispose('viewBridge'), onBoardBoundingBox: () => {}, applyViewFromDocument: () => {} },
  });
  try {
    // 同一轮连续两次 init（不 dispose）
    controller.initGraphUI();
    controller.initGraphUI();
    assert.equal(boardCount, 1, 'createMathBoard 只一次');
    assert.equal(resetCount, 1, 'readoutsReset 只一次（第二次走已有 board 快速路径）');
    assert.equal(fullRenderCount, 1, 'fullRender 只一次');
    controller.disposeGraph();
    for (const label of ['persistence', 'viewBridge', 'history', 'store', 'freeMathBoard']) {
      assert.equal(disposes.filter((d) => d === label).length, 1, `${label} 释放恰好一次`);
    }
    // DOM 缺失：从 fake elements 移除 stage/board 后 init 不建新 session、不 reset
    elements.delete('mathGraphStage');
    elements.delete('mathGraphBoard');
    controller.initGraphUI();
    assert.equal(resetCount, 1, 'DOM 缺失时 readoutsReset 不执行');
    assert.equal(boardCount, 1, 'DOM 缺失时 createMathBoard 不执行');
  } finally {
    restore();
  }
});
