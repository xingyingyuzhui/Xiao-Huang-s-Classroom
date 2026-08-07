/** 完整依赖图：引用索引、跨类型拓扑、传递闭包、环拒绝。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function depModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-dependency-plan.js')).href,
  );
}

function docWith({ functions = [], points = [], constructions = [] } = {}) {
  return {
    schemaVersion: 2,
    id: 'd',
    title: 't',
    functions,
    points,
    constructions,
    view: { boundingBox: [-8, 8, 8, -8], axes: {} },
    presentation: { activeFunctionId: functions[0]?.id || null, compare: null },
    annotations: { version: 1, strokes: [] },
    meta: {},
  };
}

const fn = (id) => ({ id, kind: 'preset', preset: 'quadratic', colorSlot: 0, explicitColor: null });
const pt = (id, constraint) => ({ id, x: 0, y: 0, constraint });
const cr = (id, kind, extra = {}) => ({ id, kind, ...extra });

test('topological order mixes points and constructions across types', async () => {
  const { graphTopologicalOrder } = await depModule();
  const doc = docWith({
    functions: [fn('f1'), fn('f2')],
    points: [
      pt('U1', { kind: 'followFunction', functionId: 'f1', anchorX: 1 }),
      pt('Ui', { kind: 'intersection', targetIds: ['c1', 'c2'], nearX: 0 }),
    ],
    constructions: [
      cr('c1', 'line', { pointIds: ['U1', 'U2'] }),
      cr('c2', 'line', { pointIds: ['U1', 'U3'] }),
      cr('c3', 'perp', { pointIds: ['Ui'], targetConstrId: 'c1' }),
    ],
  });
  const order = graphTopologicalOrder(doc);
  const position = (id) => order.findIndex((e) => e.id === id);
  // 依赖在前
  assert.ok(position('f1') < position('U1'));
  assert.ok(position('U1') < position('c1'));
  assert.ok(position('c1') < position('Ui'), 'line-line intersection point after its lines');
  assert.ok(position('c2') < position('Ui'));
  assert.ok(position('Ui') < position('c3'), 'downstream perpendicular after intersection point');
  // 不按类型分桶：c1/c2 之间可穿插普通点
  assert.equal(order.length, 7);
});

test('graphDependentsOf returns the full transitive closure', async () => {
  const { graphDependentsOf } = await depModule();
  const doc = docWith({
    functions: [fn('f1'), fn('f2')],
    points: [
      pt('U1', { kind: 'followFunction', functionId: 'f1', anchorX: 1 }),
      pt('Uv', { kind: 'followFeature', functionId: 'f1', feature: 'vertex', featureIndex: 0 }),
      pt('Ui', { kind: 'intersection', targetIds: ['f1', 'f2'], nearX: 0 }),
      pt('Ui2', { kind: 'intersection', targetIds: ['c1', 'c2'], nearX: 0 }),
    ],
    constructions: [
      cr('c1', 'segment', { pointIds: ['U1', 'U2'] }),
      cr('c2', 'tangent', { pointIds: ['Uv'], fnId: 'f1' }),
      cr('c3', 'perp', { pointIds: ['Ui'], targetConstrId: 'c1' }),
      cr('c5', 'perp', { pointIds: ['Ui2'], targetConstrId: 'c2' }),
    ],
  });
  const deps = graphDependentsOf(doc, ['f1']);
  // f1 更新 → U1/Uv/Ui 与 c1/c2/c3/c5 及传递下游
  assert.ok(deps.pointIds.includes('U1'));
  assert.ok(deps.pointIds.includes('Uv'));
  assert.ok(deps.pointIds.includes('Ui'));
  assert.ok(deps.pointIds.includes('Ui2'), 'intersection of constructions depends transitively');
  assert.ok(deps.constructionIds.includes('c1'));
  assert.ok(deps.constructionIds.includes('c2'));
  assert.ok(deps.constructionIds.includes('c3'));
  assert.ok(deps.constructionIds.includes('c5'));
  // 只依赖 f2 的交点不受 f1 影响
  const deps2 = graphDependentsOf(doc, ['f2']);
  assert.ok(deps2.pointIds.includes('Ui'));
  assert.equal(deps2.pointIds.includes('U1'), false);
});

test('remove order is the strict reverse of add order', async () => {
  const { graphTopologicalOrder, graphRemoveOrder } = await depModule();
  const doc = docWith({
    functions: [fn('f1')],
    points: [pt('U1', { kind: 'followFunction', functionId: 'f1', anchorX: 1 })],
    constructions: [cr('c1', 'segment', { pointIds: ['U1', 'U2'] })],
  });
  const add = graphTopologicalOrder(doc).map((e) => e.id);
  const remove = graphRemoveOrder(doc).map((e) => e.id);
  assert.deepEqual(remove, [...add].reverse());
});

test('cycle detection rejects direct and transitive cycles', async () => {
  const { findGraphDependencyCycle, buildGraphDependencyIndex } = await depModule();
  // 构造互相引用：c1 → c2 → c1
  const cyclic = docWith({
    functions: [fn('f1')],
    constructions: [
      cr('c1', 'perp', { pointIds: [], targetConstrId: 'c2' }),
      cr('c2', 'perp', { pointIds: [], targetConstrId: 'c1' }),
    ],
  });
  const cycle = findGraphDependencyCycle(cyclic);
  assert.ok(cycle, 'cycle must be detected');
  assert.ok(cycle.length >= 3, `cycle path ${JSON.stringify(cycle)}`);
  // 无环文档
  const acyclic = docWith({
    functions: [fn('f1')],
    points: [pt('U1', { kind: 'followFunction', functionId: 'f1', anchorX: 1 })],
    constructions: [cr('c1', 'segment', { pointIds: ['U1', 'U2'] })],
  });
  assert.equal(findGraphDependencyCycle(acyclic), null);
  assert.ok(buildGraphDependencyIndex(acyclic).nodeById.size >= 3);
});

test('dependency index derives refs from document only, never runtime flags', async () => {
  const { buildGraphDependencyIndex } = await depModule();
  const doc = docWith({
    functions: [fn('f1')],
    points: [
      pt('U1', { kind: 'followFunction', functionId: 'f1', anchorX: 1 }),
      pt('U2', { kind: 'free' }),
    ],
    constructions: [cr('c1', 'segment', { pointIds: ['U1', 'U2'] })],
  });
  const index = buildGraphDependencyIndex(doc);
  assert.deepEqual([...index.nodeById.get('U1').deps], ['f1']);
  assert.equal(index.nodeById.get('U2').deps.size, 0);
  assert.deepEqual([...index.nodeById.get('c1').deps], ['U1', 'U2']);
  assert.equal(index.nodeById.get('f1').deps.size, 0);
});
