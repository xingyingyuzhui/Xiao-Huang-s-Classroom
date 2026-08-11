/**
 * GraphToolController：全部作图工具的分发契约。
 * 锁定重构回归——尤其 context.addPointAt 空调用、deleteFn 未注入、线段不吸附曲线。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

/** @type {typeof import('../../apps/web/src/math/graph/graph-tool-controller.js')} */
let mod;

test.before(async () => {
  mod = await import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-tool-controller.js')).href
  );
});

function makeHarness(overrides = {}) {
  const calls = {
    createPerpToAxis: [],
    createPerpToLine: [],
    createPerpToFn: [],
    createUserPoint: [],
    createSegmentOrLine: [],
    createTangent: [],
    commit: [],
    removeUserPoint: [],
    removeConstruction: [],
    deleteFn: [],
    boardUpdate: 0,
    hints: [],
  };
  const state = {
    board: {
      unitX: 40,
      update() {
        calls.boardUpdate += 1;
      },
    },
    notes: { isActive: () => false },
    toolStrip: {
      tool: overrides.tool || 'perp-axis',
      getTool() {
        return this.tool;
      },
      setTool(id) {
        this.tool = id;
      },
      setHint(text) {
        calls.hints.push(String(text || ''));
      },
      getHint() {
        return '';
      },
    },
    toolPick: null,
    toolOneShot: false,
    userPoints: [],
    constructions: [],
    functions: [],
    styleBind: null,
    ...overrides.state,
  };

  const userById = new Map();
  const ctrl = mod.createGraphToolController({
    getState: () => state,
    makeDrawHost: () => ({
      findUserEl: (id) => userById.get(id)?.el || null,
      getBoard: () => state.board,
      getFunctions: () => state.functions,
      getConstructions: () => state.constructions,
    }),
    findUserRec: (el) => state.userPoints.find((r) => r.el === el) || null,
    ensureUserPointFromHit:
      overrides.ensureUserPointFromHit ||
      ((el, usrX, usrY) => {
        if (!el) return null;
        const existing = state.userPoints.find((r) => r.el === el);
        if (existing) return existing;
        return null;
      }),
    resolveCurveFromTap: overrides.resolveCurveFromTap || (() => null),
    nearestFnAt: overrides.nearestFnAt || (() => null),
    createUserPoint: (x, y, opts = {}) => {
      const rec = {
        id: `p${calls.createUserPoint.length + 1}`,
        el: {
          id: `el-p${calls.createUserPoint.length + 1}`,
          X: () => x,
          Y: () => y,
          _mathUserPoint: true,
        },
        baseName: 'P',
        followTargetId: opts.followTargetId || null,
        intersectFnIds: opts.intersectFnIds || null,
        x,
        y,
      };
      calls.createUserPoint.push({ x, y, opts });
      state.userPoints.push(rec);
      userById.set(rec.id, rec);
      return rec;
    },
    removeUserPointById: (id) => {
      calls.removeUserPoint.push(id);
      state.userPoints = state.userPoints.filter((r) => r.id !== id);
      userById.delete(id);
    },
    commitPointDocument: () => {},
    commitConstructionDocument: (rec) => {
      calls.commit.push(rec);
    },
    removeConstructionById: (id) => {
      calls.removeConstruction.push(id);
    },
    deleteFn: (id) => {
      calls.deleteFn.push(id);
    },
    setUserPointFollowTarget: async () => {},
    reregisterSelectable: () => {},
    evalFnY: () => 0,
    followTol: () => 0.3,
    isLineLike: (el) => Boolean(el?._mathLineLike),
    isCurveEl: (el) => el?.elType === 'functiongraph' || el?.elType === 'curve',
    createPerpToAxis: (...args) => {
      calls.createPerpToAxis.push(args);
      return { id: 'c-axis', kind: 'perp', args };
    },
    createPerpToLine: (...args) => {
      calls.createPerpToLine.push(args);
      return { id: 'c-line', kind: 'perp', args };
    },
    createPerpToFn: (...args) => {
      calls.createPerpToFn.push(args);
      return { id: 'c-fn', kind: 'perp', args };
    },
    createSegmentOrLine: (...args) => {
      calls.createSegmentOrLine.push(args);
      return { id: 'c-seg', kind: args[1], args };
    },
    createTangent: (...args) => {
      calls.createTangent.push(args);
      return { id: 'c-tan', kind: 'tangent', args };
    },
    findFunctionIntersectionNear: overrides.findFunctionIntersectionNear || (() => null),
    hitFollowNear: overrides.hitFollowNear || (() => null),
    appConfirm: overrides.appConfirm || (async () => false),
    fnDisplayLabel: (fn) => fn?.id || 'f',
    followIdForFn: (id) => `graph:fn:${id}`,
    curveFollowTargetId: (id) => `graph:fn:${id}`,
    userPointIdOf: (el) => state.userPoints.find((r) => r.el === el)?.id || null,
    ...overrides.context,
  });

  function seedPoint(id, x = 1, y = 2, extra = {}) {
    const rec = {
      id,
      el: { id: `el-${id}`, X: () => x, Y: () => y, _mathUserPoint: true },
      baseName: id,
      ...extra,
    };
    state.userPoints.push(rec);
    userById.set(id, rec);
    return rec;
  }

  return { state, ctrl, calls, seedPoint };
}

// ─── 加点 ───

test('加点：必须调用内部 addPointAt，不得走未注入的 context.addPointAt', async () => {
  const { state, ctrl, calls } = makeHarness({ tool: 'point' });
  state.toolStrip.tool = 'point';

  await ctrl.handleToolTap({ usrX: 1.5, usrY: -2, hit: null });

  assert.equal(calls.createUserPoint.length, 1, '应创建用户点');
  assert.equal(calls.createUserPoint[0].x, 1.5);
  assert.equal(calls.createUserPoint[0].y, -2);
  assert.equal(calls.boardUpdate, 1);
});

test('加点：靠近交点且确认 → 以交点约束创建', async () => {
  const { state, ctrl, calls } = makeHarness({
    tool: 'point',
    findFunctionIntersectionNear: () => ({
      fnA: { id: 'f1' },
      fnB: { id: 'f2' },
      x: 0.5,
      y: 1.25,
    }),
    appConfirm: async () => true,
  });
  state.toolStrip.tool = 'point';
  state.functions = [{ id: 'f1', visible: true }, { id: 'f2', visible: true }];

  await ctrl.handleToolTap({ usrX: 0.4, usrY: 1.2, hit: null });

  assert.equal(calls.createUserPoint.length, 1);
  assert.deepEqual(calls.createUserPoint[0].opts.intersectFnIds, ['f1', 'f2']);
  assert.equal(calls.createUserPoint[0].x, 0.5);
  assert.equal(calls.createUserPoint[0].y, 1.25);
});

test('加点：靠近曲线且确认跟随 → snap 到曲线', async () => {
  const { state, ctrl, calls } = makeHarness({
    tool: 'point',
    hitFollowNear: () => ({
      target: {
        id: 'graph:fn:f1',
        label: 'f1',
        snap: (x) => ({ x, y: 7 }),
      },
      distance: 0.1,
    }),
    appConfirm: async () => true,
  });
  state.toolStrip.tool = 'point';

  await ctrl.handleToolTap({ usrX: 2, usrY: 6.8, hit: null });

  assert.equal(calls.createUserPoint.length, 1);
  assert.equal(calls.createUserPoint[0].opts.followTargetId, 'graph:fn:f1');
  assert.equal(calls.createUserPoint[0].y, 7);
});

// ─── 删除 ───

test('删除：命中用户点 → removeUserPointById', async () => {
  const { state, ctrl, calls, seedPoint } = makeHarness({ tool: 'delete' });
  state.toolStrip.tool = 'delete';
  const rec = seedPoint('pA', 1, 1);

  await ctrl.handleToolTap({ usrX: 1, usrY: 1, hit: rec.el });

  assert.deepEqual(calls.removeUserPoint, ['pA']);
});

test('删除：未精确命中但在 16px 内 → 仍删近邻点', async () => {
  const { state, ctrl, calls, seedPoint } = makeHarness({ tool: 'delete' });
  state.toolStrip.tool = 'delete';
  seedPoint('pNear', 0, 0);
  // unitX=40 → 0.3 用户单位 ≈ 12px < 16
  await ctrl.handleToolTap({ usrX: 0.3, usrY: 0, hit: null });

  assert.deepEqual(calls.removeUserPoint, ['pNear']);
});

test('删除：命中函数曲线 → context.deleteFn（不是 state.deleteFn）', async () => {
  const curve = { elType: 'functiongraph' };
  const { state, ctrl, calls } = makeHarness({ tool: 'delete' });
  state.toolStrip.tool = 'delete';
  state.functions = [{ id: 'f9', curve, locked: false }];

  await ctrl.handleToolTap({ usrX: 0, usrY: 0, hit: curve });

  assert.deepEqual(calls.deleteFn, ['f9']);
});

// ─── 线段 ───

test('线段第一步：靠近曲线时吸附 near.y + followId，而非直接落自由点', async () => {
  const nearFn = { id: 'f3', curve: { elType: 'functiongraph' } };
  const { state, ctrl, calls } = makeHarness({
    tool: 'segment',
    nearestFnAt: () => ({ fn: nearFn, d: 0.02, y: 4.5 }),
  });
  state.toolStrip.tool = 'segment';

  await ctrl.handleToolTap({ usrX: 1, usrY: 4.1, hit: null });

  assert.equal(calls.createUserPoint.length, 1);
  assert.equal(calls.createUserPoint[0].y, 4.5);
  assert.equal(calls.createUserPoint[0].opts.followTargetId, 'graph:fn:f3');
  assert.equal(state.toolPick?.tool, 'segment');
});

test('线段两步完成 → createSegmentOrLine + commit', async () => {
  const { state, ctrl, calls, seedPoint } = makeHarness({ tool: 'segment' });
  state.toolStrip.tool = 'segment';
  const a = seedPoint('pA', 0, 0);
  const b = seedPoint('pB', 2, 2);
  state.toolPick = { tool: 'segment', pointId: 'pA' };

  await ctrl.handleToolTap({ usrX: 2, usrY: 2, hit: b.el });

  assert.equal(calls.createSegmentOrLine.length, 1);
  assert.equal(calls.createSegmentOrLine[0][1], 'segment');
  assert.deepEqual(calls.createSegmentOrLine[0][4], ['pA', 'pB']);
  assert.equal(calls.commit.length, 1);
  assert.equal(state.toolPick, null);
  assert.ok(a.el);
});

// ─── 垂线（既有契约）───

test('垂线第二步：靠近 x 轴 → createPerpToAxis(host, pt, "x", pointId)', async () => {
  const { state, ctrl, calls, seedPoint } = makeHarness();
  seedPoint('pA', 2, 3);
  state.toolPick = { tool: 'perp-axis', pointId: 'pA' };

  await ctrl.handleToolTap({ usrX: 2, usrY: 0.05, hit: null });

  assert.equal(calls.createPerpToAxis.length, 1, '应调用 createPerpToAxis');
  assert.equal(calls.createPerpToAxis[0][2], 'x', '第三参必须是轴名，不是 hit 对象');
  assert.equal(calls.createPerpToAxis[0][3], 'pA');
  assert.equal(calls.createPerpToLine.length, 0);
  assert.equal(calls.createPerpToFn.length, 0);
  assert.equal(calls.commit.length, 1);
  assert.equal(state.toolPick, null, '完成后清空 pick');
});

test('垂线第二步：点在已有直线上 → createPerpToLine', async () => {
  const { state, ctrl, calls, seedPoint } = makeHarness();
  seedPoint('pA', 1, 1);
  state.toolPick = { tool: 'perp-axis', pointId: 'pA' };
  const lineEl = { _mathLineLike: true, _mathConstrId: 'L1' };

  await ctrl.handleToolTap({ usrX: 0, usrY: 0, hit: lineEl });

  assert.equal(calls.createPerpToLine.length, 1);
  assert.equal(calls.createPerpToLine[0][2], lineEl);
  assert.equal(calls.createPerpToLine[0][3], 'pA');
  assert.equal(calls.createPerpToLine[0][4], 'L1');
  assert.equal(calls.createPerpToAxis.length, 0);
  assert.equal(calls.commit.length, 1);
});

test('垂线第二步：点在曲线上 → createPerpToFn（轴容差之外）', async () => {
  const fn = { id: 'f1', curve: {} };
  const { state, ctrl, calls, seedPoint } = makeHarness({
    resolveCurveFromTap: () => fn,
  });
  seedPoint('pA', 1, 4);
  state.toolPick = { tool: 'perp-axis', pointId: 'pA' };

  await ctrl.handleToolTap({ usrX: 1, usrY: 4, hit: fn.curve });

  assert.equal(calls.createPerpToFn.length, 1);
  assert.equal(calls.createPerpToFn[0][2], fn);
  assert.equal(calls.createPerpToFn[0][3], 'pA');
  assert.equal(calls.createPerpToAxis.length, 0);
});

test('垂线第一步：靠近曲线时用 near.fn.id / near.y 吸附，而非 near.id / usrY', async () => {
  const nearFn = { id: 'f2', curve: {} };
  const { state, ctrl, calls } = makeHarness({
    nearestFnAt: () => ({ fn: nearFn, d: 0.01, y: 9 }),
  });

  await ctrl.handleToolTap({ usrX: 3, usrY: 1.5, hit: null });

  assert.equal(calls.createUserPoint.length, 1);
  assert.equal(calls.createUserPoint[0].x, 3);
  assert.equal(calls.createUserPoint[0].y, 9, '应落到曲线 y，而不是点击的 usrY');
  assert.equal(calls.createUserPoint[0].opts.followTargetId, 'graph:fn:f2');
  assert.equal(state.toolPick?.pointId, 'p1');
});

test('垂线第一步：空白处也可落自由点再进入第二步', async () => {
  const { state, ctrl, calls } = makeHarness({
    nearestFnAt: () => null,
  });

  await ctrl.handleToolTap({ usrX: -2, usrY: 5, hit: null });

  assert.equal(calls.createUserPoint.length, 1);
  assert.equal(calls.createUserPoint[0].opts.followTargetId ?? null, null);
  assert.equal(state.toolPick?.tool, 'perp-axis');
});

// ─── 切线 ───

test('切线：点在曲线附近 → createUserPoint + createTangent + commit', async () => {
  const fn = { id: 'f1', curve: { elType: 'functiongraph' } };
  const { state, ctrl, calls } = makeHarness({
    tool: 'tangent',
    resolveCurveFromTap: () => fn,
    context: {
      pickTangentFollowTargetId: () => 'graph:fn:f1',
      evalFnY: () => 3,
    },
  });
  state.toolStrip.tool = 'tangent';

  await ctrl.handleToolTap({ usrX: 1, usrY: 2.9, hit: fn.curve });

  assert.equal(calls.createUserPoint.length, 1);
  assert.equal(calls.createUserPoint[0].y, 3);
  assert.equal(calls.createTangent.length, 1);
  assert.equal(calls.commit.length, 1);
});
