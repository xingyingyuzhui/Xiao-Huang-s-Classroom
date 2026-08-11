import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

const MOD = path.join(root, 'apps/web/src/math/graph/construction');

async function load(name) {
  return import(pathToFileURL(path.join(MOD, name)).href);
}

test('disposing a construction removes its endpoint update callbacks', async () => {
  const { bindConstructionDependency, clearConstructionDependencies } = await load('dependencies.js');
  const endpoint = { _mathDepIntersectTicks: new Set() };
  const construction = { els: [] };
  const tick = () => {};

  bindConstructionDependency(construction, endpoint, tick);
  assert.equal(endpoint._mathDepIntersectTicks.has(tick), true);

  clearConstructionDependencies(construction);
  assert.equal(endpoint._mathDepIntersectTicks.has(tick), false);
  assert.equal(construction._mathDependencyBindings, undefined);
});

test('bindIntersectVisibility registers four unique endpoints for two disjoint lines', async () => {
  const { bindIntersectVisibility } = await load('intersection-lifecycle.js');
  const { clearConstructionDependencies } = await load('dependencies.js');

  const makeEp = () => ({
    on() {},
    _mathDepIntersectTicks: new Set(),
  });
  const a1 = makeEp();
  const a2 = makeEp();
  const b1 = makeEp();
  const b2 = makeEp();
  const lineA = { elType: 'line', point1: a1, point2: a2 };
  const lineB = { elType: 'line', point1: b1, point2: b2 };
  const constructions = [
    { id: 'LA', kind: 'line', els: [lineA] },
    { id: 'LB', kind: 'line', els: [lineB] },
  ];
  const host = {
    getBoard: () => ({ getBoundingBox: () => [-10, 10, 10, -10] }),
    findConstr: (id) => constructions.find((c) => c.id === id) || null,
    getConstructions: () => constructions,
  };
  const point = {
    setAttribute() {},
    label: { setAttribute() {} },
    on() {},
    X: () => 0,
    Y: () => 0,
    _mathIntersectComputeRaw: () => ({ x: 0, y: 0 }),
  };
  const rec = { id: 'IX', kind: 'intersect', lineIds: ['LA', 'LB'], els: [point] };
  constructions.push(rec);

  bindIntersectVisibility(host, rec, point, ['LA', 'LB']);
  assert.equal(rec._mathDependencyBindings?.length, 4);

  // 重复调用不得叠加
  bindIntersectVisibility(host, rec, point, ['LA', 'LB']);
  assert.equal(rec._mathDependencyBindings?.length, 4);

  clearConstructionDependencies(rec);
  assert.equal(a1._mathDepIntersectTicks.size, 0);
  assert.equal(a2._mathDepIntersectTicks.size, 0);
  assert.equal(b1._mathDepIntersectTicks.size, 0);
  assert.equal(b2._mathDepIntersectTicks.size, 0);
});

test('shared endpoint yields three unique bindings', async () => {
  const { bindIntersectVisibility } = await load('intersection-lifecycle.js');
  const makeEp = () => ({ on() {}, _mathDepIntersectTicks: new Set() });
  const shared = makeEp();
  const a2 = makeEp();
  const b2 = makeEp();
  const lineA = { elType: 'line', point1: shared, point2: a2 };
  const lineB = { elType: 'line', point1: shared, point2: b2 };
  const constructions = [
    { id: 'LA', kind: 'line', els: [lineA] },
    { id: 'LB', kind: 'line', els: [lineB] },
  ];
  const host = {
    getBoard: () => ({ getBoundingBox: () => [-10, 10, 10, -10] }),
    findConstr: (id) => constructions.find((c) => c.id === id) || null,
    getConstructions: () => constructions,
  };
  const point = {
    setAttribute() {},
    label: { setAttribute() {} },
    on() {},
    X: () => 0,
    Y: () => 0,
    _mathIntersectComputeRaw: () => ({ x: 0, y: 0 }),
  };
  const rec = { id: 'IX', kind: 'intersect', lineIds: ['LA', 'LB'], els: [point] };
  constructions.push(rec);
  bindIntersectVisibility(host, rec, point, ['LA', 'LB']);
  assert.equal(rec._mathDependencyBindings?.length, 3);
});

test('100 endpoint triggers coalesce to one scheduled side effect per frame', async () => {
  const { scheduleIntersectUpdate, configureIntersectUpdateScheduler, flushIntersectUpdates } =
    await load('intersect-update.js');
  /** @type {FrameRequestCallback[]} */
  const queue = [];
  configureIntersectUpdateScheduler({
    requestFrame: (cb) => {
      queue.push(cb);
      return 1;
    },
    cancelFrame: () => {
      queue.length = 0;
    },
  });
  let side = 0;
  const pt = {
    _mathIntersectInvalidate() {},
    _mathIntersectUpdate() {
      side += 1;
    },
  };
  for (let i = 0; i < 100; i += 1) scheduleIntersectUpdate(pt);
  assert.equal(queue.length, 1);
  queue[0](0);
  assert.equal(side, 1);
  flushIntersectUpdates();
});

test('rebuild 20 times does not grow endpoint callback counts', async () => {
  const { bindIntersectVisibility } = await load('intersection-lifecycle.js');
  const { clearConstructionDependencies } = await load('dependencies.js');
  const makeEp = () => ({ on() {}, _mathDepIntersectTicks: new Set() });
  const eps = [makeEp(), makeEp(), makeEp(), makeEp()];
  const lineA = { elType: 'line', point1: eps[0], point2: eps[1] };
  const lineB = { elType: 'line', point1: eps[2], point2: eps[3] };
  const constructions = [
    { id: 'LA', kind: 'line', els: [lineA] },
    { id: 'LB', kind: 'line', els: [lineB] },
  ];
  const host = {
    getBoard: () => ({ getBoundingBox: () => [-10, 10, 10, -10] }),
    findConstr: (id) => constructions.find((c) => c.id === id) || null,
    getConstructions: () => constructions,
  };
  const point = {
    setAttribute() {},
    label: { setAttribute() {} },
    on() {},
    X: () => 0,
    Y: () => 0,
    _mathIntersectComputeRaw: () => ({ x: 0, y: 0 }),
  };
  const rec = { id: 'IX', kind: 'intersect', lineIds: ['LA', 'LB'], els: [point] };
  constructions.push(rec);

  for (let i = 0; i < 20; i += 1) {
    clearConstructionDependencies(rec);
    delete point._mathIntersectUpdate;
    delete point._mathIntersectUpdateBound;
    bindIntersectVisibility(host, rec, point, ['LA', 'LB']);
  }
  assert.equal(rec._mathDependencyBindings?.length, 4);
  for (const ep of eps) {
    assert.equal(ep._mathDepIntersectTicks.size, 1);
  }
});
