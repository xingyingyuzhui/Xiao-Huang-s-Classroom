/**
 * Graph board session 原子回滚合同（Task 2）。
 *
 * 断言：createGraphBoardSession 在任一创建阶段失败时立即逆序回滚已创建资源，
 * 不向外部注册部分 disposer；成功时只向外注册一个组合 disposer，执行后按逆序
 * 各清理一次且幂等。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after } = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

/** board-session 依赖 window.localStorage（持久化工厂）；测试注入 fake 并在结束时恢复。 */
const prevWindow = globalThis.window;
before(() => {
  globalThis.window = {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
});
after(() => {
  if (prevWindow === undefined) delete globalThis.window;
  else globalThis.window = prevWindow;
});

async function sessionModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-board-session.js')).href,
  );
}

const FAIL_STAGES = [
  'persistence.load',
  'createMathBoard',
  'bindPointLabelFusion',
  'createGraphIdAllocator',
  'createGraphStore',
  'createGraphHistory',
  'history.clear',
  'store.subscribe',
  'register',
];

/** 构建可故障注入的 deps；dispose/free/unsubscribe 记录到 calls。 */
function makeDeps({ failAt = null } = {}) {
  const calls = [];
  const dispose = (label) => () => calls.push(`dispose:${label}`);
  const maybeThrow = (stage) => {
    if (failAt === stage) throw new Error(`injected ${stage}`);
  };

  const state = {
    board: null,
    functions: [],
    fXMin: -10,
    fXMax: 10,
  };
  const persistence = {
    dispose: dispose('persistence'),
    load: () => {
      maybeThrow('persistence.load');
      return { document: { functions: [] } };
    },
    flush: () => {},
    scheduleSave: () => {},
  };
  const board = {
    on: () => {},
    off: () => {},
    removeObject: () => {},
    update: () => {},
    getBoundingBox: () => [-8, 8, 8, -8],
    create: () => ({ setAttribute: () => {} }),
    remove: () => {},
  };
  const store = {
    getDocument: () => ({ functions: [] }),
    subscribe: () => {
      maybeThrow('store.subscribe');
      return () => calls.push('unsubscribe');
    },
    dispose: dispose('store'),
    beginTransaction: () => {},
    commitTransaction: () => {},
    cancelTransaction: () => {},
  };
  const history = {
    dispose: dispose('history'),
    clear: () => {
      maybeThrow('history.clear');
    },
    subscribe: () => () => {},
  };

  const registerCalls = [];
  const register = (fn) => {
    maybeThrow('register');
    registerCalls.push(fn);
  };

  return {
    state,
    getStageEl: () => null,
    createGraphPersistence: () => {
      maybeThrow('createGraphPersistence');
      return persistence;
    },
    createMathBoard: () => {
      maybeThrow('createMathBoard');
      return board;
    },
    followIdForFn: (id) => `graph:fn:${id}`,
    fnDisplayLabel: () => 'f(x)',
    resolveFunctionColor: () => '#b45309',
    onAxisSettingsChange: () => {},
    bindPointLabelFusion: () => {
      maybeThrow('bindPointLabelFusion');
    },
    unbindPointLabelFusion: () => calls.push('unbindPointLabelFusion'),
    viewBridge: { dispose: dispose('viewBridge'), onBoardBoundingBox: () => {}, applyViewFromDocument: () => {} },
    register,
    clearAllConstructions: () => {},
    makeDrawHost: () => ({ getConstructions: () => [], getBoard: () => board }),
    removeUserPointEls: () => {},
    removeAllFnCurves: () => {},
    freeMathBoard: () => calls.push('freeMathBoard'),
    createGraphIdAllocator: () => {
      maybeThrow('createGraphIdAllocator');
      return { nextFunctionId: () => 'f1', nextPointId: () => 'U1', nextConstructionId: () => 'C1', reseed: () => {} };
    },
    syncRuntimeFromDocument: () => ({ ok: true }),
    graphRenderer: { recover: () => ({ ok: true }) },
    createGraphStore: (initial) => {
      maybeThrow('createGraphStore');
      return store;
    },
    createGraphHistory: () => {
      maybeThrow('createGraphHistory');
      return history;
    },
    calls,
    registerCalls,
    persistence,
    board,
    store,
    history,
  };
}

test('每个中间失败点都立即逆序回滚，且不向外部注册部分 disposer', async () => {
  const { createGraphBoardSession } = await sessionModule();
  for (const failAt of FAIL_STAGES) {
    const deps = makeDeps({ failAt });
    assert.throws(() => createGraphBoardSession(deps), /injected/, `stage ${failAt} 必须抛原始错误`);
    assert.equal(deps.registerCalls.length, 0, `stage ${failAt} 失败不得注册外部 disposer`);

    // 资源清理次数：已创建成功的资源各恰好一次，未创建的资源为零
    const created = new Set();
    if (failAt !== 'persistence.load') created.add('dispose:persistence');
    if (['bindPointLabelFusion', 'createGraphIdAllocator', 'createGraphStore', 'createGraphHistory', 'history.clear', 'store.subscribe', 'register'].includes(failAt)) {
      created.add('freeMathBoard');
      created.add('dispose:viewBridge');
    }
    // store/history 的「创建」阶段失败 = 未创建 = 零清理；创建成功后的阶段失败才需清理
    if (['createGraphHistory', 'history.clear', 'store.subscribe', 'register'].includes(failAt)) created.add('dispose:store');
    if (['history.clear', 'store.subscribe', 'register'].includes(failAt)) created.add('dispose:history');
    // subscribe 失败 = 未订阅 = 零清理；仅 register 失败时 unsubscribe 已入栈需清理
    if (failAt === 'register') created.add('unsubscribe');

    for (const label of created) {
      assert.equal(deps.calls.filter((c) => c === label).length, 1, `${failAt} 后 ${label} 清理恰好一次`);
    }
    // 未创建资源零清理
    if (failAt === 'persistence.load' || failAt === 'createMathBoard') {
      assert.equal(deps.calls.filter((c) => c === 'dispose:store').length, 0, `${failAt} 后 store 零清理`);
    }
  }
});

test('成功时只发布一个组合 disposer，执行后逆序清理一次且幂等', async () => {
  const { createGraphBoardSession } = await sessionModule();
  const deps = makeDeps();
  const session = createGraphBoardSession(deps);

  assert.ok(session.board, '返回完整 session');
  assert.ok(session.store, '返回 store');
  assert.equal(deps.registerCalls.length, 1, '外部 register 只收到一个组合 disposer');
  assert.equal(deps.calls.length, 0, '创建阶段没有任何提前 dispose');

  deps.registerCalls[0]();
  const order = deps.calls;
  // 逆序：unsubscribe → history → store → board 相关 → viewBridge → persistence
  const expectedOrder = ['unsubscribe', 'dispose:history', 'dispose:store', 'unbindPointLabelFusion', 'freeMathBoard', 'dispose:viewBridge', 'dispose:persistence'];
  assert.deepEqual(order, expectedOrder, `清理顺序 ${JSON.stringify(order)}`);

  deps.registerCalls[0](); // 幂等
  assert.deepEqual(deps.calls, expectedOrder, '第二次执行无副作用');
});

test('rollback 中一个 disposer 抛错不阻断其余，原始创建错误仍 rethrow', async () => {
  const { createGraphBoardSession } = await sessionModule();
  const deps = makeDeps({ failAt: 'createGraphStore' });
  // 让 board 清理抛错：覆盖 freeMathBoard
  deps.freeMathBoard = () => {
    deps.calls.push('freeMathBoard');
    throw new Error('freeMathBoard exploded');
  };
  assert.throws(() => createGraphBoardSession(deps), /injected createGraphStore/, '原始创建错误优先');
  // persistence/viewBridge/board 清理仍执行（freeMathBoard 抛错后其余继续）
  assert.equal(deps.calls.filter((c) => c === 'dispose:viewBridge').length, 1, 'viewBridge 仍清理');
  assert.equal(deps.calls.filter((c) => c === 'dispose:persistence').length, 1, 'persistence 仍清理');
});

test('rollback 中 history.dispose 抛错：其余清理继续，聚合错误日志恰好一次', async () => {
  const { createGraphBoardSession } = await sessionModule();
  const deps = makeDeps({ failAt: 'history.clear' });
  // history 已创建并 own：其 dispose 抛错不阻断 store/board/persistence 清理
  deps.history.dispose = () => {
    deps.calls.push('dispose:history');
    throw new Error('history dispose exploded');
  };
  const originalError = console.error;
  const logCalls = [];
  console.error = (...args) => logCalls.push(args);
  try {
    assert.throws(
      () => createGraphBoardSession(deps),
      /injected history\.clear/,
      '原始创建错误优先，不被 cleanup error 覆盖',
    );
    assert.equal(deps.calls.filter((c) => c === 'dispose:store').length, 1, 'store 仍清理');
    assert.equal(deps.calls.filter((c) => c === 'freeMathBoard').length, 1, 'board 仍清理');
    assert.equal(deps.calls.filter((c) => c === 'dispose:viewBridge').length, 1, 'viewBridge 仍清理');
    assert.equal(deps.calls.filter((c) => c === 'dispose:persistence').length, 1, 'persistence 仍清理');
    // 聚合错误通过一次可见日志输出，携带抛错 disposer 的 error
    assert.equal(logCalls.length, 1, '聚合日志恰好一次');
    assert.match(String(logCalls[0][0]), /board session dispose errors/, '日志标记明确');
    assert.equal(logCalls[0][1].length, 1, '日志携带一个 error');
    assert.match(String(logCalls[0][1][0]?.message || ''), /history dispose exploded/, '日志含抛错详情');
  } finally {
    console.error = originalError;
  }
});
