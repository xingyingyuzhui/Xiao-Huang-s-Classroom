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
      env.observers.push({ cb, disconnected: false });
    }
    observe() {}
    disconnect() {
      env.observers.forEach((o) => {
        o.disconnected = true;
      });
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
      importJson: async () => {
        calls.push('importJson');
        if (ctx.pickJsonFile) {
          const text = await ctx.pickJsonFile();
          calls.push(`pick:${text}`);
        }
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

test('dispose 后异步回调不修改已销毁状态', async () => {
  const { controller, env, elements, restore } = await makeController();
  controller.initGraphUI();
  controller.disposeGraph();
  // 模拟用户延迟选择文件（change 已在 dispose 时移除）
  const input = elements.get('mathGraphFileInput');
  assert.equal(input.listeners.change?.length || 0, 0);
  restore();
});
