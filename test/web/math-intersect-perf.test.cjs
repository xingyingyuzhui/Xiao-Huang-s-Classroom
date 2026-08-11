/**
 * 交点 / 标签融合性能门禁与结构契约
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function load(rel) {
  return import(pathToFileURL(path.join(root, rel)).href);
}

function mockPoint(opts) {
  const {
    id = 'p',
    baseName = 'P',
    x = 0,
    y = 0,
    showCoords = true,
    elType = 'point',
    role = {},
  } = opts;
  return {
    id,
    elType,
    _mathBaseName: baseName,
    _mathShowCoords: showCoords,
    _mathLiveLabelBound: true,
    _mathUserPoint: role.user || false,
    _mathConstrKind: role.kind || undefined,
    _mathFeatureMark: role.feature || false,
    _mathConstrId: role.constrId,
    visProp: { visible: role.visible !== false },
    _mathIntersectOnBody: role.onBody,
    _mathExtendRay: role.extendRay || false,
    _is_removed: role.removed || false,
    X: () => x,
    Y: () => y,
    label: {
      lastText: null,
      setText(content) {
        this.lastText = typeof content === 'function' ? content() : String(content ?? '');
      },
      setAttribute() {},
    },
  };
}

test('clusterLabeledPoints scales near-linear for 100 separated points', async () => {
  const { clusterLabeledPoints } = await load('apps/web/src/math/shared/point-label-fusion.js');
  const pts = [];
  for (let i = 0; i < 100; i += 1) {
    pts.push(
      mockPoint({
        id: `p${i}`,
        baseName: `P${i}`,
        x: i * 2,
        y: (i % 10) * 2,
        role: { kind: 'intersect' },
      }),
    );
  }
  const t0 = process.hrtime.bigint();
  const clusters = clusterLabeledPoints(pts, { tolX: 0.05, tolY: 0.05 });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(clusters.length, 100);
  assert.ok(ms < 50, `100-point fusion clustering took ${ms}ms`);
});

test('clusterLabeledPoints still merges nearby groups', async () => {
  const { clusterLabeledPoints } = await load('apps/web/src/math/shared/point-label-fusion.js');
  const a = mockPoint({ id: 'a', baseName: 'A', x: 0, y: 0, role: { kind: 'intersect' } });
  const b = mockPoint({ id: 'b', baseName: 'B', x: 0.02, y: 0, role: { kind: 'intersect' } });
  const c = mockPoint({ id: 'c', baseName: 'C', x: 10, y: 10, role: { kind: 'intersect' } });
  const clusters = clusterLabeledPoints([a, b, c], { tolX: 0.05, tolY: 0.05 });
  assert.equal(clusters.length, 2);
});

test('intersect keys index avoids full-array rescans', async () => {
  const { buildIntersectKeyIndex, lineLineIntersectKey, lineFnIntersectKey } = await load(
    'apps/web/src/math/graph/construction/intersect-keys.js',
  );
  const host = {
    getConstructions: () => [
      { kind: 'intersect', lineIds: ['C2', 'C1'], fnIds: [] },
      { kind: 'intersect', lineIds: ['L1'], fnIds: ['F1'], intersectIndex: 0 },
      { kind: 'segment', id: 'C9' },
    ],
  };
  const map = buildIntersectKeyIndex(host);
  assert.equal(map.size, 2);
  assert.ok(map.has(lineLineIntersectKey('C1', 'C2')));
  assert.ok(map.has(lineFnIntersectKey('L1', 'F1', 0)));
});

test('intersect update scheduler coalesces to one flush per frame', async () => {
  const { configureIntersectUpdateScheduler, scheduleIntersectUpdate, pendingIntersectUpdateCount, flushIntersectUpdates } =
    await load('apps/web/src/math/graph/construction/intersect-update.js');

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

  let calls = 0;
  const pt = {
    _mathIntersectUpdate() {
      calls += 1;
    },
  };
  scheduleIntersectUpdate(pt);
  scheduleIntersectUpdate(pt);
  scheduleIntersectUpdate(pt);
  assert.equal(pendingIntersectUpdateCount(), 1);
  assert.equal(queue.length, 1);
  queue[0](0);
  assert.equal(calls, 1);
  flushIntersectUpdates();
});

test('viewport bounds helpers clip points outside board', async () => {
  const { readViewportBounds, pointInViewport } = await load(
    'apps/web/src/math/shared/viewport-bounds.js',
  );
  const board = {
    getBoundingBox: () => [-10, 10, 10, -10],
  };
  const bounds = readViewportBounds(board);
  assert.deepEqual(bounds, { xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
  assert.equal(pointInViewport(0, 0, bounds), true);
  assert.equal(pointInViewport(50, 0, bounds), false);
});

test('board-label and intersections wire perf contracts', () => {
  const label = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/board-label.js'),
    'utf8',
  );
  const intersections = fs.readFileSync(
    path.join(root, 'apps/web/src/math/graph/construction/intersections.js'),
    'utf8',
  );
  const renderers = fs.readFileSync(
    path.join(root, 'apps/web/src/math/graph/construction/intersection-renderers.js'),
    'utf8',
  );
  const index = fs.readFileSync(path.join(root, 'apps/web/src/math/graph/index.js'), 'utf8');

  assert.match(label, /_mathSchedulePointLabelFusion/);
  assert.doesNotMatch(label, /_mathRefreshPointLabelFusion/);
  assert.match(label, /_mathLabelHiddenForDrag/);
  assert.match(label, /autoPosition: false/);

  assert.match(intersections, /suspendUpdate/);
  assert.match(intersections, /buildIntersectKeyIndex/);
  assert.match(intersections, /MAX_LINE_FN_INDEX/);

  assert.match(renderers, /_mathIntersectComputeCount/);
  assert.match(renderers, /_mathShowCoords = false/);
  assert.match(renderers, /scheduleIntersectUpdate/);
  assert.match(intersections, /MAX_LINE_FN_INDEX = 7/);

  assert.match(index, /_mathRefreshPointLabelFusion = \(\) => schedulePointLabelFusion/);
});

test('MAX_LINE_FN_INDEX retains complete 0..7 line-function search', () => {
  const intersections = fs.readFileSync(
    path.join(root, 'apps/web/src/math/graph/construction/intersections.js'),
    'utf8',
  );
  assert.match(intersections, /MAX_LINE_FN_INDEX = 7/);
  assert.doesNotMatch(intersections, /createdInBranch === 0\) break/);
});
