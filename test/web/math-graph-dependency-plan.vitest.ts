/** 完整依赖图：引用索引、跨类型拓扑、传递闭包、环拒绝。 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

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

test('graphDependentsOf exposes cross-type addOrder/removeOrder for the full f1 closure', async () => {
  const { graphDependentsOf } = await depModule();
  // f1 → U1(followFunction) → c1(segment U1,U2)
  // f1 → Uv(followFeature vertex) → c2(tangent Uv,f1)
  // f1 + f2 → Ui(intersection) → c3(perp through Ui)
  // c1 + c2 → Ui2(intersection of constructions) → c5(perp through Ui2)
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
  const plan = graphDependentsOf(doc, ['f1']);
  // 闭包类型分桶：所有传递下游 point/construction
  for (const id of ['U1', 'Uv', 'Ui', 'Ui2']) {
    assert.ok(plan.pointIds.includes(id), `closure must include point ${id}`);
  }
  for (const id of ['c1', 'c2', 'c3', 'c5']) {
    assert.ok(plan.constructionIds.includes(id), `closure must include construction ${id}`);
  }
  // addOrder 覆盖闭包全集（含根），上游先、跨类型混排
  assert.ok(Array.isArray(plan.addOrder), 'addOrder must be present');
  const add = plan.addOrder;
  const addIds = add.map((e) => (typeof e === 'string' ? e : e.id));
  const addTypes = add.map((e) => (typeof e === 'string' ? 'point' : e.type));
  assert.equal(addIds[0], 'f1', 'function root created first');
  for (const id of ['U1', 'Uv', 'Ui', 'Ui2', 'c1', 'c2', 'c3', 'c5', 'f1']) {
    assert.ok(addIds.includes(id), `addOrder must include ${id}`);
  }
  assert.equal(addIds.includes('f2'), false, 'unrelated function excluded from closure');
  const pos = (id) => addIds.indexOf(id);
  assert.ok(pos('f1') < pos('U1'), 'follow point after its function');
  assert.ok(pos('U1') < pos('c1'), 'segment after its points');
  assert.ok(pos('Uv') < pos('c2'), 'tangent after its follow point');
  assert.ok(pos('c1') < pos('Ui2'), 'line-line intersection point after its lines');
  assert.ok(pos('c2') < pos('Ui2'), 'line-line intersection point after both lines');
  assert.ok(pos('Ui2') < pos('c5'), 'downstream perpendicular after intersection point');
  assert.ok(pos('Ui') < pos('c3'), 'perp after its through-point');
  // 跨类型混排：point/construction 交替出现，不得按类型分桶
  const runs = [];
  for (let i = 0; i < addTypes.length; i++) {
    if (i === 0 || addTypes[i] !== addTypes[i - 1]) runs.push(addTypes[i]);
  }
  assert.ok(
    runs.filter((t) => t === 'point').length >= 2 &&
      runs.filter((t) => t === 'construction').length >= 2,
    `addOrder must interleave types, got ${JSON.stringify(addTypes)}`,
  );
  // removeOrder 是 addOrder 严格逆序
  assert.ok(Array.isArray(plan.removeOrder), 'removeOrder must be present');
  assert.deepEqual(plan.removeOrder, [...add].reverse(), 'removeOrder is strict reverse of addOrder');
  const removeIds = plan.removeOrder.map((e) => e.id);
  assert.equal(removeIds[0], 'c5', 'deepest downstream removed first');
  assert.equal(removeIds[removeIds.length - 1], 'f1', 'function removed last');
});

test('constructionRefs and pointConstraintRefs cover all documented reference fields', async () => {
  const { constructionRefs, pointConstraintRefs } = await depModule();
  // tangent: fnId + pointIds
  const tangent = constructionRefs(cr('c2', 'tangent', { pointIds: ['Uv'], fnId: 'f1' }));
  assert.deepEqual(tangent.functions, ['f1']);
  assert.deepEqual(tangent.points, ['Uv']);
  assert.equal(tangent.constructions.length, 0);
  // perp to line: targetConstrId + pointIds
  const perp = constructionRefs(
    cr('c3', 'perp', { pointIds: ['Ui'], targetConstrId: 'c1', perpTarget: 'line', extend: true }),
  );
  assert.deepEqual(perp.constructions, ['c1']);
  assert.deepEqual(perp.points, ['Ui']);
  assert.equal(perp.functions.length, 0);
  // perp to axis: axis/perpTarget are type markers, never object refs
  const axis = constructionRefs(cr('c8', 'perp', { pointIds: ['Ui'], axis: 'x', perpTarget: 'axis' }));
  assert.deepEqual(axis.points, ['Ui']);
  assert.equal(axis.constructions.length, 0);
  assert.equal(axis.functions.length, 0);
  // secant: fnId + numeric x1/x2（数值不是引用）
  const secant = constructionRefs(cr('c4', 'secant', { fnId: 'f1', x1: -1, x2: 2, showDelta: true }));
  assert.deepEqual(secant.functions, ['f1']);
  assert.equal(secant.points.length, 0);
  assert.equal(secant.constructions.length, 0);
  // intersect fn-fn: fnIds + pointIds
  const interFn = constructionRefs(
    cr('c6', 'intersect', { fnIds: ['f1', 'f2'], pointIds: ['Ui'], intersectIndex: 1 }),
  );
  assert.deepEqual(interFn.functions, ['f1', 'f2']);
  assert.deepEqual(interFn.points, ['Ui']);
  assert.equal(interFn.constructions.length, 0);
  // intersect line-line: lineIds + pointIds
  const interLine = constructionRefs(
    cr('c6b', 'intersect', { lineIds: ['c1', 'c2'], pointIds: ['Ui2'] }),
  );
  assert.deepEqual(interLine.constructions, ['c1', 'c2']);
  assert.deepEqual(interLine.points, ['Ui2']);
  assert.equal(interLine.functions.length, 0);
  // intersect line+fn: lineIds + fnIds + pointIds
  const interMixed = constructionRefs(
    cr('c6c', 'intersect', { lineIds: ['c1'], fnIds: ['f1'], pointIds: ['Ux'] }),
  );
  assert.deepEqual(interMixed.functions, ['f1']);
  assert.deepEqual(interMixed.constructions, ['c1']);
  assert.deepEqual(interMixed.points, ['Ux']);
  // pointConstraintRefs：followFunction/followFeature → functionId
  assert.deepEqual(
    pointConstraintRefs({ kind: 'followFunction', functionId: 'f1', anchorX: 1 }).functions,
    ['f1'],
  );
  assert.deepEqual(
    pointConstraintRefs({ kind: 'followFeature', functionId: 'f1', feature: 'vertex', featureIndex: 0 })
      .functions,
    ['f1'],
  );
  // pointConstraintRefs：intersection → targetIds 可能是函数或构造
  const interPt = pointConstraintRefs({ kind: 'intersection', targetIds: ['f1', 'f2'], nearX: 0 });
  assert.deepEqual(interPt.functions, ['f1', 'f2']);
  assert.deepEqual(interPt.constructions, ['f1', 'f2']);
  const interPtLines = pointConstraintRefs({ kind: 'intersection', targetIds: ['c1', 'c2'], nearX: 0 });
  assert.deepEqual(interPtLines.functions, ['c1', 'c2']);
  assert.deepEqual(interPtLines.constructions, ['c1', 'c2']);
  assert.deepEqual(pointConstraintRefs({ kind: 'free' }).functions, []);
  assert.deepEqual(pointConstraintRefs({ kind: 'free' }).constructions, []);
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
