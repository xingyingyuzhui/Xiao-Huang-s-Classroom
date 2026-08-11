import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

async function fusionMod() {
  return import(
    pathToFileURL(
      path.join(root, 'apps/web/src/math/shared/point-label-fusion.js'),
    ).href
  );
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
    },
  };
}

test('classifyPointRole ranks user > intersect > foot > feature > other', async () => {
  const { classifyPointRole } = await fusionMod();
  assert.equal(classifyPointRole(mockPoint({ role: { user: true } })).rank, 0);
  assert.equal(
    classifyPointRole(mockPoint({ role: { kind: 'intersect' } })).rank,
    1,
  );
  assert.equal(
    classifyPointRole(mockPoint({ elType: 'perpendicularpoint' })).rank,
    2,
  );
  assert.equal(
    classifyPointRole(mockPoint({ role: { kind: 'perp' } })).rank,
    2,
  );
  assert.equal(
    classifyPointRole(mockPoint({ role: { feature: true } })).rank,
    3,
  );
  assert.equal(classifyPointRole(mockPoint({})).rank, 4);
});

test('clusterLabeledPoints builds AABB connected components', async () => {
  const { clusterLabeledPoints } = await fusionMod();
  const a = mockPoint({ id: 'a', baseName: 'U1', x: 0, y: 0, role: { user: true } });
  const b = mockPoint({ id: 'b', baseName: 'U2', x: 0.05, y: 0, role: { user: true } });
  const c = mockPoint({ id: 'c', baseName: 'U3', x: 0.1, y: 0, role: { user: true } });
  const far = mockPoint({ id: 'd', baseName: 'U4', x: 5, y: 5, role: { user: true } });
  const clusters = clusterLabeledPoints([a, b, c, far], { tolX: 0.06, tolY: 0.06 });
  assert.equal(clusters.length, 2);
  const multi = clusters.find((cl) => cl.members.length === 3);
  const single = clusters.find((cl) => cl.members.length === 1);
  assert.ok(multi);
  assert.ok(single);
  assert.equal(multi.representative.id, 'a');
});

test('formatFusedPointLabel joins names and optional coords', async () => {
  const { formatFusedPointLabel, clusterLabeledPoints } = await fusionMod();
  const u = mockPoint({
    id: 'u',
    baseName: 'U1',
    x: 2,
    y: 3,
    role: { user: true },
  });
  const i = mockPoint({
    id: 'i',
    baseName: '交点',
    x: 2.01,
    y: 3,
    role: { kind: 'intersect' },
  });
  const [cluster] = clusterLabeledPoints([u, i], { tolX: 0.05, tolY: 0.05 });
  assert.equal(formatFusedPointLabel(cluster), 'U1·交点(2, 3)');

  i._mathShowCoords = false;
  u._mathShowCoords = false;
  assert.equal(formatFusedPointLabel(cluster), 'U1·交点');
});

test('isLabeledPointCandidate rejects hidden and unbound points', async () => {
  const { isLabeledPointCandidate } = await fusionMod();
  assert.equal(isLabeledPointCandidate(mockPoint({})), true);
  assert.equal(
    isLabeledPointCandidate(mockPoint({ role: { visible: false } })),
    false,
  );
  assert.equal(
    isLabeledPointCandidate(mockPoint({ role: { onBody: false, kind: 'intersect' } })),
    false,
  );
  assert.equal(
    isLabeledPointCandidate(mockPoint({ role: { extendRay: true } })),
    false,
  );
  const unbound = mockPoint({});
  unbound._mathLiveLabelBound = false;
  assert.equal(isLabeledPointCandidate(unbound), false);
});

test('applyPointLabelFusion suppresses non-representatives', async () => {
  const { applyPointLabelFusion } = await fusionMod();
  const u = mockPoint({
    id: 'u',
    baseName: 'U1',
    x: 0,
    y: 0,
    role: { user: true },
  });
  const i = mockPoint({
    id: 'i',
    baseName: '交点',
    x: 0,
    y: 0,
    role: { kind: 'intersect' },
  });
  const solo = mockPoint({
    id: 's',
    baseName: 'U9',
    x: 10,
    y: 10,
    role: { user: true },
  });
  let soloRestored = 0;
  solo._mathLiveLabelTick = () => {
    soloRestored += 1;
    solo.label.setText('U9(10, 10)');
  };

  applyPointLabelFusion([u, i, solo], { tolX: 0.1, tolY: 0.1 });

  assert.equal(u._mathLabelFusionSuppressed, false);
  assert.equal(i._mathLabelFusionSuppressed, true);
  assert.equal(u.label.lastText, 'U1·交点(0, 0)');
  assert.equal(i.label.lastText, '');
  assert.equal(solo._mathLabelFusionSuppressed, false);
  assert.equal(soloRestored, 1);
  assert.equal(solo.label.lastText, 'U9(10, 10)');
});

test('fusion module stays shared and does not import graph', () => {
  const fusionSrc = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/point-label-fusion.js'),
    'utf8',
  );
  assert.doesNotMatch(fusionSrc, /from ['"]\.\.\/graph/);
  assert.match(fusionSrc, /export function clusterLabeledPoints/);
  assert.match(fusionSrc, /export function applyPointLabelFusion/);
});

test('same-bucket 5000 points form one cluster with linear ops', async () => {
  const { clusterLabeledPoints } = await fusionMod();
  const pts = [];
  for (let i = 0; i < 5000; i += 1) {
    pts.push(
      mockPoint({
        id: `d${i}`,
        baseName: `D${i}`,
        x: 0.001 * (i % 10),
        y: 0.001 * (Math.floor(i / 10) % 10),
        role: { kind: 'intersect' },
      }),
    );
  }
  const stats = { xyReads: 0, distanceChecks: 0, unions: 0, buckets: 0 };
  const t0 = performance.now();
  const clusters = clusterLabeledPoints(pts, { tolX: 0.05, tolY: 0.05 }, { stats });
  const ms = performance.now() - t0;
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].members.length, 5000);
  assert.equal(stats.xyReads, 10000);
  assert.ok(stats.distanceChecks < 5000, `no O(N^2) checks, got ${stats.distanceChecks}`);
  assert.ok(stats.unions < 5000);
  assert.ok(ms < 500, `dense fusion ${ms}ms`);
});

test('cross-bucket chain A-B-C merges; far neighbor does not', async () => {
  const { clusterLabeledPoints } = await fusionMod();
  const tol = { tolX: 1, tolY: 1 };
  // bucket boundaries at integers for tol=1
  const a = mockPoint({ id: 'a', baseName: 'A', x: 0.9, y: 0, role: { user: true } });
  const b = mockPoint({ id: 'b', baseName: 'B', x: 1.1, y: 0, role: { user: true } });
  const c = mockPoint({ id: 'c', baseName: 'C', x: 2.0, y: 0, role: { user: true } });
  const far = mockPoint({ id: 'f', baseName: 'F', x: 10, y: 10, role: { user: true } });
  const clusters = clusterLabeledPoints([a, b, c, far], tol);
  assert.equal(clusters.length, 2);
  const multi = clusters.find((cl) => cl.members.length === 3);
  assert.ok(multi);
});

test('adjacent buckets beyond tolerance stay separate', async () => {
  const { clusterLabeledPoints } = await fusionMod();
  const tol = { tolX: 1, tolY: 1 };
  const a = mockPoint({ id: 'a', baseName: 'A', x: 0.1, y: 0, role: { user: true } });
  const b = mockPoint({ id: 'b', baseName: 'B', x: 1.9, y: 0, role: { user: true } });
  // same neighboring buckets possible but distance 1.8 > 1
  const clusters = clusterLabeledPoints([a, b], tol);
  assert.equal(clusters.length, 2);
});

test('negative coords and priority representative preserved', async () => {
  const { clusterLabeledPoints } = await fusionMod();
  const u = mockPoint({ id: 'u', baseName: 'U', x: -0.01, y: -0.01, role: { user: true } });
  const i = mockPoint({
    id: 'i',
    baseName: '交点',
    x: 0,
    y: 0,
    role: { kind: 'intersect' },
  });
  const [cluster] = clusterLabeledPoints([i, u], { tolX: 0.05, tolY: 0.05 });
  assert.equal(cluster.representative.id, 'u');
});

test('scattered 5000 points stay near-linear in distance checks', async () => {
  const { clusterLabeledPoints } = await fusionMod();
  const pts = [];
  for (let i = 0; i < 5000; i += 1) {
    pts.push(
      mockPoint({
        id: `s${i}`,
        baseName: `S${i}`,
        x: i * 3,
        y: (i % 50) * 3,
        role: { kind: 'intersect' },
      }),
    );
  }
  const stats = { xyReads: 0, distanceChecks: 0, unions: 0, buckets: 0 };
  const clusters = clusterLabeledPoints(pts, { tolX: 0.05, tolY: 0.05 }, { stats });
  assert.equal(clusters.length, 5000);
  assert.equal(stats.xyReads, 10000);
  // 分散点邻桶几乎不相交；允许少量检查但远小于 N^2
  assert.ok(stats.distanceChecks < 5000 * 20, `checks=${stats.distanceChecks}`);
});

test('board-label schedules fusion after drag end (no sync refresh / autoPosition)', () => {
  const labelSrc = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/board-label.js'),
    'utf8',
  );
  const hookStart = labelSrc.indexOf('export function ensurePointGeomHook');
  assert.ok(hookStart > 0);
  const hookSrc = labelSrc.slice(hookStart);
  assert.match(hookSrc, /_mathDepIntersectTicks/);
  assert.match(hookSrc, /_mathSchedulePointLabelFusion/);
  assert.match(hookSrc, /_mathLabelHiddenForDrag/);
  assert.doesNotMatch(hookSrc, /_mathRefreshPointLabelFusion/);
  assert.doesNotMatch(hookSrc, /setAutoPosition/);
  assert.match(labelSrc, /export function setLabelContent/);
  assert.match(labelSrc, /_mathLabelFusionSuppressed/);
});

test('graph registers fusion schedule and feature marks', () => {
  const graphSrc = fs.readFileSync(
    path.join(root, 'apps/web/src/math/graph/index.js'),
    'utf8',
  );
  const fnRuntime = fs.readFileSync(
    path.join(root, 'apps/web/src/math/graph/graph-function-runtime.js'),
    'utf8',
  );
  assert.match(graphSrc, /point-label-fusion/);
  assert.match(graphSrc, /_mathSchedulePointLabelFusion/);
  assert.match(graphSrc, /_mathRefreshPointLabelFusion = \(\) => schedulePointLabelFusion/);
  // 特征点/渐近线绘制已随曲线生命周期移入 function-runtime 模块
  assert.match(fnRuntime, /paintActiveFeatureMarks/);
  assert.match(fnRuntime, /_mathFeatureMark/);
});
