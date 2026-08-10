/**
 * Graph runtime/follow 接线回归（main 运行时质量恢复计划 Task 1-2）。
 *
 * 真实 import 生产 factory（createGraphFunctionRuntime / createGraphFollowTargets），
 * 注入 fake board/state/frame task 与全部 context 依赖，直接调用 rebuildCurve() /
 * listFollowTargets()。禁止只读源码正则；不 mock 故障点（未解构标识符）。
 *
 * 唯一被 mock 的模块是 jsx-board.js（JSXGraph 边界：其 import 链在纯 Node/vitest
 * 下会因 jsxgraph 包 exports 限制解析失败），故障点仍保持真实。
 */
import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

// JSXGraph 边界：jsx-board.js 的 import 链（jsxgraph + 其 CSS）无法在 vitest node
// 环境解析（package exports 限制），mock 掉该边界；board-lifecycle 其余真实。
vi.mock('../../apps/web/src/math/shared/jsx-board.js', () => ({
  restyleMathBoard: () => {},
}));

async function runtimeModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-function-runtime.js')).href,
  );
}
async function followTargetsModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-follow-targets.js')).href,
  );
}
async function tangentFollowModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/tangent-follow.js')).href,
  );
}
async function followTargetSharedModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/shared/follow-target.js')).href,
  );
}

// ───────────────────────── fake board / 依赖 ─────────────────────────

/** 记录 board.create 调用的 fake JSXGraph board。 */
function makeFakeBoard(calls) {
  return {
    create(type, args, opts) {
      calls.push(`board-create:${type}`);
      return { _mathType: type, ...opts };
    },
    removeObject() {
      calls.push('board-remove-object');
    },
    update() {
      calls.push('board-update');
    },
    _mathAxisLegend: {
      refresh() {
        calls.push('legend-refresh');
      },
    },
  };
}

const fnRec = (id, overrides = {}) => ({
  id,
  kind: 'preset',
  preset: 'quadratic',
  coeffs: { a: 1, b: 0, c: 0 },
  name: 'y=x²',
  visible: true,
  domain: { mode: 'viewport' },
  curve: null,
  ...overrides,
});

/**
 * runtime factory 全部 context 依赖（计数注入）。rebuildCurve 的调用顺序断言
 * 依赖这些记录名，改生产代码时同步维护。
 */
function makeRuntimeDeps(calls) {
  const board = makeFakeBoard(calls);
  const state = {
    board,
    functions: [],
    curve: null,
    activeFnId: null,
    marks: [],
    asy: [],
    fXMin: -10,
    fXMax: 10,
    referenceCurve: null,
  };
  return {
    state,
    getState: () => state,
    evalFnY: () => 0,
    colors: () => ({ diagram: '#111', ink: '#222', pointRing: '#fff' }),
    activeFn: () => null,
    curveRebuildTask: { cancel: () => calls.push('cancel-frame') },
    withPreservedViewport: (boardArg, fn) => {
      calls.push('preserve-viewport');
      fn();
    },
    snapshotUserPoints: () => {
      calls.push('snapshot-points');
      return [];
    },
    snapshotConstructions: () => {
      calls.push('snapshot-constructions');
      return [];
    },
    clearAllConstructions: () => calls.push('clear-constructions'),
    removeUserPointEls: () => calls.push('remove-user-points'),
    restoreUserPoints: () => calls.push('restore-points'),
    restoreConstructions: () => calls.push('restore-constructions'),
    autoIntersectNewLine: () => {},
    lineLikeElOf: () => null,
    reregisterSelectable: () => calls.push('reregister-selectable'),
    renderFnList: () => calls.push('render-list'),
    syncParamPanel: () => calls.push('sync-param-panel'),
    paintReadouts: () => calls.push('paint-readouts'),
    mirrorActiveToLegacy: () => calls.push('mirror-active'),
    boardLabelAttrs: () => ({}),
    applyBoardLabel: () => {},
    formatElementCoordsLabel: () => '',
    asymptotes: () => [],
    clearExtras: () => calls.push('clear-extras'),
    schedulePointLabelFusion: () => calls.push('schedule-fusion'),
    makeDrawHost: () => ({
      getBoard: () => state.board,
      getFunctions: () => state.functions,
      getConstructions: () => [],
    }),
  };
}

/** follow targets factory 的全部 context 依赖。 */
async function makeFollowDeps(calls, state) {
  const tangent = await tangentFollowModule();
  return {
    state,
    getState: () => state,
    evalFnY: (fn, x) => {
      const { a, b, c } = fn?.coeffs || {};
      return a * x * x + b * x + c;
    },
    fnDisplayLabel: (fn) => fn.name || fn.id,
    recomputeFunctionIntersection: () => null,
    createGraphCommitBridge: () => ({
      commitPointDocument() {},
      commitConstructionDocument() {},
      removeConstructionById() {},
      removeUserPointById() {},
    }),
    vertexFeatureOfFn: tangent.vertexFeatureOfFn,
    mainCurveFollowId: 'graph:main',
    schedulePointLabelFusion: () => calls.push('label-fusion'),
  };
}

// ───────────────────────── runtime 接线 ─────────────────────────

test('rebuildCurve 只消费注入依赖并保留 viewport', async () => {
  const mod = await runtimeModule();
  const calls = [];
  const { state, ...context } = makeRuntimeDeps(calls);

  const runtime = mod.createGraphFunctionRuntime(context);
  assert.doesNotThrow(() => runtime.rebuildCurve());
  assert.deepEqual(
    calls.slice(0, 3),
    ['cancel-frame', 'preserve-viewport', 'snapshot-points'],
    `重建开头必须依次 cancel frame → 保留 viewport → 快照用户点，实际 ${JSON.stringify(calls.slice(0, 3))}`,
  );
  assert.equal(
    calls.filter((x) => x === 'render-list').length,
    1,
    'renderFnList 恰好 1 次',
  );
  assert.equal(calls.filter((x) => x === 'board-update').length, 1, 'board.update 恰好 1 次');
  assert.equal(state.curve, null, '重建后活动曲线引用被清空');
});

test('rebuildCurve 可见函数经注入 board.create 建曲线；隐藏函数不建', async () => {
  const mod = await runtimeModule();
  const calls = [];
  const deps = makeRuntimeDeps(calls);
  deps.state.functions = [
    fnRec('f1'),
    fnRec('f2', { visible: false }),
  ];
  deps.state.activeFnId = 'f1';

  const runtime = mod.createGraphFunctionRuntime(deps);
  assert.doesNotThrow(() => runtime.rebuildCurve());
  assert.equal(
    calls.filter((x) => x === 'board-create:functiongraph').length,
    1,
    '只有可见函数建曲线',
  );
  assert.equal(deps.state.functions[0].curve._mathFnId, 'f1', '新建曲线挂到 fn.curve 并标记 _mathFnId');
  assert.equal(deps.state.functions[1].curve, null, '隐藏函数不建曲线');
});

// ───────────────────────── follow targets 接线 ─────────────────────────

test('follow targets：可见二次函数 → curve target + vertex feature target + legacy graph:main', async () => {
  const mod = await followTargetsModule();
  const shared = await followTargetSharedModule();
  const calls = [];
  const state = {
    board: { update: () => calls.push('board-update') },
    functions: [fnRec('f1', { curve: { id: 'curve-f1' } })],
    activeFnId: 'f1',
    userPoints: [],
    marks: [],
    asy: [],
    constructions: [],
    styleBind: {
      selection: {
        clear: () => calls.push('selection-clear'),
        registerMany: () => calls.push('selection-register'),
      },
    },
  };
  const followTargets = mod.createGraphFollowTargets(await makeFollowDeps(calls, state));

  const targets = followTargets.listFollowTargets();
  const ids = targets.map((t) => t.id);
  assert.ok(
    ids.includes(shared.curveFollowTargetId('f1')),
    `curve target 存在，实际 ${JSON.stringify(ids)}`,
  );
  assert.ok(
    ids.includes(shared.featureFollowTargetId('f1', 'vertex')),
    `vertex feature target 存在，实际 ${JSON.stringify(ids)}`,
  );
  assert.ok(
    ids.includes('graph:main'),
    `legacy graph:main 兼容目标存在，实际 ${JSON.stringify(ids)}`,
  );
  const legacy = targets.find((t) => t.id === 'graph:main');
  const curveTarget = targets.find((t) => t.id === shared.curveFollowTargetId('f1'));
  assert.equal(legacy.label, curveTarget.label, 'legacy 目标沿用主曲线 label');

  // makeDrawHost().onChanged()：只调注入的 selection 注册 + label fusion + 一次 board update
  followTargets.makeDrawHost().onChanged();
  assert.equal(
    calls.filter((x) => x === 'selection-register').length,
    1,
    'selection 只注册一次',
  );
  assert.equal(calls.filter((x) => x === 'label-fusion').length, 1, 'label fusion 只调度一次');
  assert.equal(
    calls.filter((x) => x === 'board-update').length,
    1,
    'onChanged 只触发一次 board update',
  );
});

test('follow targets：隐藏函数不产生 target', async () => {
  const mod = await followTargetsModule();
  const shared = await followTargetSharedModule();
  const calls = [];
  const state = {
    board: { update: () => {} },
    functions: [
      fnRec('f1', { curve: { id: 'curve-f1' } }),
      fnRec('f2', { visible: false, curve: null }),
    ],
    activeFnId: 'f1',
    userPoints: [],
    marks: [],
    asy: [],
    constructions: [],
    styleBind: null,
  };
  const followTargets = mod.createGraphFollowTargets(await makeFollowDeps(calls, state));
  const ids = followTargets.listFollowTargets().map((t) => t.id);
  assert.ok(
    !ids.includes(shared.curveFollowTargetId('f2')),
    `隐藏函数 f2 不得有 curve target，实际 ${JSON.stringify(ids)}`,
  );
  assert.ok(
    !ids.includes(shared.featureFollowTargetId('f2', 'vertex')),
    `隐藏函数 f2 不得有 vertex target，实际 ${JSON.stringify(ids)}`,
  );
  assert.ok(
    ids.includes(shared.curveFollowTargetId('f1')),
    `可见函数 f1 target 仍在，实际 ${JSON.stringify(ids)}`,
  );
});

// ───────────────────────── 参考曲线缓存：实例隔离 ─────────────────────────

test('参考曲线 key 缓存属于 runtime 实例：双实例互不影响 create/detach 计数', async () => {
  const mod = await runtimeModule();
  const doc = {
    presentation: {
      compare: {
        reference: { kind: 'preset', preset: 'quadratic', coeffs: { a: 2, b: 0, c: 1 }, expr: '' },
      },
    },
  };

  const mk = () => {
    const calls = [];
    const deps = makeRuntimeDeps(calls);
    const runtime = mod.createGraphFunctionRuntime(deps);
    return { runtime, calls, state: deps.state };
  };

  const a = mk();
  const b = mk();
  const createCount = (calls) =>
    calls.filter((x) => x === 'board-create:functiongraph').length;
  const removeCount = (calls) => calls.filter((x) => x === 'board-remove-object').length;

  a.runtime.applyReferenceCurveFromDocument(doc);
  assert.equal(createCount(a.calls), 1, '实例 A 首次 apply 创建参考曲线');
  assert.ok(a.state.referenceCurve, '参考曲线对象挂到 state.referenceCurve');

  // 同一文档应用到实例 B：key 必须按实例隔离，B 也要创建自己的曲线
  b.runtime.applyReferenceCurveFromDocument(doc);
  assert.equal(createCount(b.calls), 1, '实例 B 的 key 缓存独立，不受 A 命中影响');

  // 同实例重复 apply 同一文档 → 缓存命中，不重复创建
  b.runtime.applyReferenceCurveFromDocument(doc);
  assert.equal(createCount(b.calls), 1, '同实例同 key 命中，不重复创建');

  // 重置 B 的 key 不得影响 A 的缓存命中
  b.runtime.resetReferenceKey();
  a.runtime.applyReferenceCurveFromDocument(doc);
  assert.equal(createCount(a.calls), 1, 'B 重置 key 不影响 A 的缓存命中');

  // A 换文档 → 旧曲线 detach + 重建
  a.runtime.applyReferenceCurveFromDocument({
    presentation: { compare: { reference: { kind: 'preset', preset: 'quadratic', coeffs: { a: 3, b: 1, c: 0 }, expr: '' } } },
  });
  assert.equal(createCount(a.calls), 2, '文档变化后 A 重建参考曲线');
  assert.equal(removeCount(a.calls), 1, '旧参考曲线被 detach 一次');
  assert.ok(a.state.referenceCurve, '新曲线挂到 state.referenceCurve');
});
