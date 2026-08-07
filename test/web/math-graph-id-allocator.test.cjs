/** ID 分配器：文档级扫描、连续不重复、reseed 契约。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function allocatorModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-id-allocator.js')).href,
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

test('allocator continues past the largest ids in the document', async () => {
  const { createGraphIdAllocator } = await allocatorModule();
  const allocator = createGraphIdAllocator(
    docWith({
      functions: [
        { id: 'f1', kind: 'preset', preset: 'quadratic' },
        { id: 'f2', kind: 'preset', preset: 'linear' },
        { id: 'f9', kind: 'preset', preset: 'abs' },
      ],
      points: [
        { id: 'U1', x: 0, y: 0 },
        { id: 'U4', x: 1, y: 1 },
      ],
      constructions: [
        { id: 'C1', kind: 'segment', pointIds: [] },
        { id: 'C8', kind: 'segment', pointIds: [] },
      ],
    }),
  );
  assert.equal(allocator.nextFunctionId(), 'f10');
  assert.equal(allocator.nextFunctionId(), 'f11');
  assert.equal(allocator.nextPointId(), 'U5');
  assert.equal(allocator.nextPointId(), 'U6');
  assert.equal(allocator.nextConstructionId(), 'C9');
  assert.equal(allocator.nextConstructionId(), 'C10');
});

test('irregular ids do not block allocation', async () => {
  const { createGraphIdAllocator } = await allocatorModule();
  const allocator = createGraphIdAllocator(
    docWith({
      functions: [{ id: 'curve-main', kind: 'preset', preset: 'quadratic' }],
      points: [{ id: 'anchor', x: 0, y: 0 }],
      constructions: [{ id: 'seg-A', kind: 'segment', pointIds: [] }],
    }),
  );
  assert.equal(allocator.nextFunctionId(), 'f1');
  assert.equal(allocator.nextPointId(), 'U1');
  assert.equal(allocator.nextConstructionId(), 'C1');
});

test('reseed re-bases ids after import or reset', async () => {
  const { createGraphIdAllocator } = await allocatorModule();
  const allocator = createGraphIdAllocator(docWith({ functions: [{ id: 'f1', kind: 'preset', preset: 'quadratic' }] }));
  assert.equal(allocator.nextFunctionId(), 'f2');
  // 导入新文档：已有 f1..f5
  allocator.reseed(
    docWith({
      functions: Array.from({ length: 5 }, (_, i) => ({ id: `f${i + 1}`, kind: 'preset', preset: 'quadratic' })),
      points: [{ id: 'U3', x: 0, y: 0 }],
      constructions: [{ id: 'C2', kind: 'segment', pointIds: [] }],
    }),
  );
  assert.equal(allocator.nextFunctionId(), 'f6');
  assert.equal(allocator.nextPointId(), 'U4');
  assert.equal(allocator.nextConstructionId(), 'C3');
  // reset：默认文档
  allocator.reseed(docWith({ functions: [{ id: 'f1', kind: 'preset', preset: 'quadratic' }] }));
  assert.equal(allocator.nextFunctionId(), 'f2');
});
