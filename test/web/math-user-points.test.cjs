/** 用户点文档契约：constraint 映射、文档快照与从文档重建。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function pointModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/user-points.js')).href,
  );
}

async function documentModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-document.js')).href,
  );
}

function makeElement(x, y) {
  return {
    X: () => x,
    Y: () => y,
    on() {},
    board: null,
    name: 'P',
  };
}

function makeControllerContext(overrides = {}) {
  const records = [];
  return {
    getBoard: () => ({ create: () => makeElement(0, 0), removeObject() {} }),
    getRecords: () => records,
    setRecords: (next) => {
      records.length = 0;
      records.push(...next);
    },
    nextId: () => `U${records.length + 1}`,
    getColors: () => ({ stamp: '#b45309', pointRing: '#111', ink: '#111' }),
    // 解析任意 followTargetId 为可用目标（含 feature 目标：snap 到当前坐标）
    resolveFollowTarget: (x, y, preferredId) => ({
      id: preferredId,
      label: preferredId,
      kind: preferredId?.includes(':feature:') ? 'feature' : 'curve',
      el: preferredId?.includes(':feature:') ? null : {},
      snap: () => ({ x, y }),
    }),
    recomputeIntersection: () => null,
    listSnapTargets: () => [],
    makeDrawHost: () => ({ getBoard: () => null }),
    onSelectableChanged: () => {},
    getSelection: () => null,
    getViewportCenter: () => ({ x: 0, y: 0 }),
    defaultFollowTargetId: 'graph:main',
    onPointMoved: () => {},
    ...overrides,
  };
}

test('document snapshot maps legacy follow ids to constraints losslessly', async () => {
  const { createUserPointController } = await pointModule();
  const records = [];
  const controller = createUserPointController(
    makeControllerContext({
      getRecords: () => records,
      setRecords: (next) => {
        records.length = 0;
        records.push(...next);
      },
      nextId: () => `U${records.length + 1}`,
      getBoard: () => ({
        create: (type, coords) => makeElement(coords[0], coords[1]),
        removeObject() {},
      }),
    }),
  );

  const curve = controller.create(1, 2, { followTargetId: 'graph:fn:f1', showCoords: true });
  const feature = controller.create(0, 0, { followTargetId: 'graph:fn:f1:feature:vertex', showCoords: true });
  const ix = controller.create(0.5, 0.5, { intersectFnIds: ['f1', 'f2'], showCoords: true });
  const free = controller.create(3, 4, { showCoords: false });

  const docPoints = controller.snapshotDocument();
  assert.equal(docPoints.length, 4);
  const byId = new Map(docPoints.map((p) => [p.id, p]));
  assert.deepEqual(byId.get(curve.id).constraint, { kind: 'followFunction', functionId: 'f1', anchorX: 1 });
  assert.deepEqual(byId.get(feature.id).constraint, { kind: 'followFeature', functionId: 'f1', feature: 'vertex', featureIndex: 0 });
  assert.deepEqual(byId.get(ix.id).constraint, { kind: 'intersection', targetIds: ['f1', 'f2'], nearX: 0.5 });
  assert.deepEqual(byId.get(free.id).constraint, { kind: 'free' });
  assert.equal(byId.get(free.id).showCoords, false);
  assert.equal(byId.get(free.id).locked, false);
  // 无 runtime 字段
  assert.equal('el' in byId.get(free.id), false);
});

test('document points round-trip through normalize', async () => {
  const { createUserPointController } = await pointModule();
  const { normalizeGraphDocument } = await documentModule();
  const records = [];
  const controller = createUserPointController(
    makeControllerContext({
      getRecords: () => records,
      setRecords: (next) => {
        records.length = 0;
        records.push(...next);
      },
      getBoard: () => ({
        create: (type, coords) => makeElement(coords[0], coords[1]),
        removeObject() {},
      }),
    }),
  );
  controller.create(1, 2, { followTargetId: 'graph:fn:f1', showCoords: true });

  const result = normalizeGraphDocument({
    schemaVersion: 2,
    id: 'd',
    title: 't',
    functions: [{ id: 'f1', kind: 'preset', preset: 'quadratic' }],
    points: controller.snapshotDocument(),
    constructions: [],
    view: { boundingBox: [-8, 8, 8, -8] },
    presentation: { activeFunctionId: 'f1' },
    annotations: { version: 1, strokes: [] },
    meta: {},
  });
  assert.equal(result.ok, true);
  const docPoint = result.document.points[0];
  assert.equal(docPoint.constraint.kind, 'followFunction');
  assert.equal(docPoint.constraint.functionId, 'f1');
});

test('createFromDocument maps constraints back to runtime follow semantics', async () => {
  const { createUserPointController } = await pointModule();
  const created = [];
  const records = [];
  const controller = createUserPointController(
    makeControllerContext({
      getRecords: () => records,
      setRecords: (next) => {
        records.length = 0;
        records.push(...next);
      },
      getBoard: () => ({
        create: (type, coords) => {
          const el = makeElement(coords[0], coords[1]);
          created.push({ type, coords });
          return el;
        },
        removeObject() {},
      }),
    }),
  );

  const follow = controller.createFromDocument({
    id: 'p1',
    name: 'A',
    x: 1,
    y: 2,
    constraint: { kind: 'followFunction', functionId: 'f1', anchorX: 1 },
    showCoords: true,
  });
  assert.equal(follow.followTargetId, 'graph:fn:f1');

  const feature = controller.createFromDocument({
    id: 'p2',
    name: 'B',
    x: 0,
    y: 0,
    constraint: { kind: 'followFeature', functionId: 'f1', feature: 'vertex', featureIndex: 0 },
    showCoords: true,
  });
  assert.equal(feature.followTargetId, 'graph:fn:f1:feature:vertex');

  const ix = controller.createFromDocument({
    id: 'p3',
    name: 'C',
    x: 0.5,
    y: 0.5,
    constraint: { kind: 'intersection', targetIds: ['f1', 'f2'], nearX: 0.5 },
    showCoords: true,
  });
  assert.deepEqual(ix.intersectFnIds, ['f1', 'f2']);

  const free = controller.createFromDocument({
    id: 'p4',
    name: 'D',
    x: 3,
    y: 4,
    constraint: { kind: 'free' },
    showCoords: false,
  });
  assert.equal(free.followTargetId, null);
  assert.equal(free.intersectFnIds, null);
  assert.equal(free.showCoords, false);
});

test('point layer add is idempotent for already-created runtime points', async () => {
  const { createPointLayer } = await import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/point-layer.js')).href,
  );
  const { createUserPointController } = await pointModule();
  const records = [];
  const controller = createUserPointController(
    makeControllerContext({
      getRecords: () => records,
      setRecords: (next) => {
        records.length = 0;
        records.push(...next);
      },
      getBoard: () => ({
        create: (type, coords) => makeElement(coords[0], coords[1]),
        removeObject() {},
      }),
    }),
  );
  // 工具已创建（runtime 记录存在）
  controller.create(1, 2, { followTargetId: 'graph:fn:f1' });
  const layer = createPointLayer({ controller, getRecords: () => records });

  const added = layer.add({ id: records[0].id, name: 'A', x: 1, y: 2, constraint: { kind: 'followFunction', functionId: 'f1', anchorX: 1 }, showCoords: true });
  assert.equal(added, null, 'existing runtime point must not be duplicated');
  assert.equal(records.length, 1);

  // 文档里有、runtime 没有 → 创建
  const created = layer.add({ id: 'p9', name: 'Z', x: 5, y: 6, constraint: { kind: 'free' }, showCoords: true });
  assert.ok(created);
  assert.equal(records.length, 2);
});

test('point layer update projects document coordinates onto runtime element', async () => {
  const { createPointLayer } = await import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/point-layer.js')).href,
  );
  let px = 1;
  let py = 2;
  const el = {
    X: () => px,
    Y: () => py,
    moveTo(coords) {
      px = coords[0];
      py = coords[1];
    },
    on() {},
    board: { update() {} },
    name: 'A',
  };
  const records = [{ id: 'p1', el, followTargetId: null, intersectFnIds: null, showCoords: true, baseName: 'A' }];
  const layer = createPointLayer({
    controller: {
      createFromDocument() {
        return null;
      },
      delete() {},
      setShowCoords() {},
    },
    getRecords: () => records,
  });
  const updated = layer.update({ id: 'p1', name: 'A', x: 7, y: -3, constraint: { kind: 'free' }, showCoords: true });
  assert.ok(updated);
  assert.equal(px, 7);
  assert.equal(py, -3);
  assert.equal(el.X(), 7);
  assert.equal(el.Y(), -3);
});

test('construction layer add/update/remove works against fake host', async () => {
  const { createConstructionLayer } = await import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/construction-layer.js')).href,
  );
  const constructions = [];
  const fakeHost = {
    getBoard: () => ({ removeObject() {} }),
    getConstructions: () => constructions,
    setConstructions: (next) => {
      constructions.length = 0;
      constructions.push(...next);
    },
    findUserEl: (id) => ({ id, X: () => 0, Y: () => 0 }),
    getFunctions: () => [],
    findConstr: (id) => constructions.find((c) => c.id === id) || null,
    evalFnY: () => null,
    findFnByCurve: () => null,
    recomputeIntersection: () => null,
    createUserPoint: () => null,
    nextConstrId: () => `C${constructions.length + 1}`,
    onChanged: () => {},
  };
  const layer = createConstructionLayer({
    makeHost: () => fakeHost,
    getConstructions: () => constructions,
  });

  // 工具已创建的 runtime 记录 → 幂等跳过
  constructions.push({ id: 'c1', kind: 'segment', pointIds: ['p1', 'p2'], els: [] });
  const added = layer.add({ id: 'c1', kind: 'segment', pointIds: ['p1', 'p2'] });
  assert.equal(added, null, 'existing construction must not be duplicated');

  // 不存在 → 尝试创建（缺 fn 等依赖时安全返回 null）
  const created = layer.add({ id: 'c9', kind: 'tangent', pointIds: ['p1'], fnId: 'f1' });
  assert.equal(created, null);

  // update：extend 切换
  const seg = constructions[0];
  seg.els = [{ _mathExtendRay: true, setAttribute() {} }];
  layer.update({ id: 'c1', extend: true });
  assert.equal(seg.extend, true);

  // remove
  layer.remove('c1');
  assert.equal(constructions.length, 0);
});
