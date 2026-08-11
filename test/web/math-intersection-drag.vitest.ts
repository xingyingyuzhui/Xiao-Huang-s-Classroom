/**
 * 交点帧缓存与拖动事件顺序（Task 3）。
 * 模拟 JSXGraph：drag handler → board.update → 读交点 X/Y。
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

const CONSTR = path.join(root, 'apps/web/src/math/graph/construction');
const SHARED = path.join(root, 'apps/web/src/math/shared');

async function load(dir, name) {
  return import(pathToFileURL(path.join(dir, name)).href);
}

test('scheduleIntersectUpdate invalidates cache before board.update reads coords', async () => {
  const { scheduleIntersectUpdate, configureIntersectUpdateScheduler, flushIntersectUpdates, pendingIntersectUpdateCount } =
    await load(CONSTR, 'intersect-update.js');

  /** @type {FrameRequestCallback[]} */
  const queue = [];
  configureIntersectUpdateScheduler({
    requestFrame: (cb) => {
      queue.push(cb);
      return queue.length;
    },
    cancelFrame: () => {
      queue.length = 0;
    },
  });

  let rawCalls = 0;
  let x = 0;
  let y = 0;
  /** @type {{ hit: { x: number, y: number } | null } | null} */
  let cache = null;

  const pt = {
    _mathIntersectInvalidate() {
      cache = null;
    },
    _mathIntersectComputeRaw() {
      if (cache) return cache.hit;
      rawCalls += 1;
      const hit = { x, y };
      cache = { hit };
      return hit;
    },
    sideEffects: 0,
    _mathIntersectUpdate() {
      // 副作用路径不得再清缓存（否则会重复求交）
      this.sideEffects += 1;
      this._mathIntersectComputeRaw();
    },
  };

  // 初次缓存旧坐标
  x = 1;
  y = 1;
  assert.deepEqual(pt._mathIntersectComputeRaw(), { x: 1, y: 1 });
  assert.equal(rawCalls, 1);

  // 端点变化：schedule 必须立刻失效，随后 board.update 读到新值
  x = 9;
  y = 9;
  scheduleIntersectUpdate(pt);
  const mid = pt._mathIntersectComputeRaw();
  assert.deepEqual(mid, { x: 9, y: 9 });
  assert.equal(rawCalls, 2, 'same board.update round recomputes once after invalidate');

  // X/Y 同轮共享缓存
  assert.deepEqual(pt._mathIntersectComputeRaw(), { x: 9, y: 9 });
  assert.equal(rawCalls, 2);

  assert.equal(queue.length, 1);
  queue[0](0);
  assert.equal(pt.sideEffects, 1);
  assert.equal(pendingIntersectUpdateCount(), 0);
  flushIntersectUpdates();
  assert.equal(pendingIntersectUpdateCount(), 0);
});

test('20 drag frames coalesce side effects to one per frame while coords stay fresh', async () => {
  const { scheduleIntersectUpdate, configureIntersectUpdateScheduler, flushIntersectUpdates } =
    await load(CONSTR, 'intersect-update.js');
  const { ensurePointGeomHook } = await load(SHARED, 'board-label.js');

  /** @type {FrameRequestCallback[]} */
  let queue = [];
  configureIntersectUpdateScheduler({
    requestFrame: (cb) => {
      queue.push(cb);
      return queue.length;
    },
    cancelFrame: () => {
      queue = [];
    },
  });

  let rawCalls = 0;
  let endpointX = 0;
  /** @type {{ hit: { x: number, y: number } | null } | null} */
  let cache = null;

  const intersectPt = {
    _mathIntersectInvalidate() {
      cache = null;
    },
    _mathIntersectComputeRaw() {
      if (cache) return cache.hit;
      rawCalls += 1;
      const hit = { x: endpointX, y: 0 };
      cache = { hit };
      return hit;
    },
    sideEffects: 0,
    _mathIntersectUpdate() {
      this.sideEffects += 1;
    },
  };

  let boardUpdates = 0;
  const endpoint = {
    _mathGeomHookBound: false,
    _mathDepIntersectTicks: new Set([() => scheduleIntersectUpdate(intersectPt)]),
    board: {
      update() {
        boardUpdates += 1;
        // board.update 读取交点
        intersectPt._mathIntersectComputeRaw();
      },
      _mathSchedulePointLabelFusion() {},
    },
    handlers: /** @type {Record<string, Function[]>} */ ({}),
    on(evt, fn) {
      if (!this.handlers[evt]) this.handlers[evt] = [];
      this.handlers[evt].push(fn);
    },
    label: { setAttribute() {} },
  };

  ensurePointGeomHook(endpoint);

  for (let i = 1; i <= 20; i += 1) {
    endpointX = i;
    // JSXGraph 顺序：drag handler → board.update
    for (const fn of endpoint.handlers.drag || []) fn();
    endpoint.board.update();
    const hit = intersectPt._mathIntersectComputeRaw();
    assert.equal(hit.x, i);
    // 冲刷本帧副作用
    const cbs = queue.splice(0);
    for (const cb of cbs) cb(0);
  }

  assert.equal(intersectPt.sideEffects, 20, 'one side-effect flush per drag frame');
  assert.ok(rawCalls <= 40, `raw compute bounded, got ${rawCalls}`);

  // up：最终 board.update 一次，交点停在最终坐标
  const updatesBeforeUp = boardUpdates;
  endpointX = 99;
  for (const fn of endpoint.handlers.up || []) fn();
  assert.ok(boardUpdates === updatesBeforeUp + 1, 'up triggers exactly one final board.update');
  assert.equal(intersectPt._mathIntersectComputeRaw().x, 99);

  flushIntersectUpdates();
});
