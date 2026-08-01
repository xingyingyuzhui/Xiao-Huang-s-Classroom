const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function pointDependencies() {
  return import(
    pathToFileURL(
      path.join(
        root,
        'apps/web/src/math/graph/construction/point-dependencies.js',
      ),
    ).href
  );
}

test('point dependency closure is returned downstream first', async () => {
  const { constructionIdsDependingOnPoint } = await pointDependencies();
  const constructions = [
    { id: 'line-a', kind: 'line', pointIds: ['point-a', 'point-b'], els: [] },
    { id: 'line-b', kind: 'line', pointIds: ['point-c', 'point-d'], els: [] },
    { id: 'perp-a', kind: 'perp', pointIds: ['point-e'], targetConstrId: 'line-a', els: [] },
    { id: 'hit-a', kind: 'intersect', lineIds: ['line-a', 'line-b'], els: [] },
    { id: 'unrelated', kind: 'segment', pointIds: ['point-z'], els: [] },
  ];

  const ids = constructionIdsDependingOnPoint(constructions, 'point-a');

  assert.deepEqual(new Set(ids), new Set(['line-a', 'perp-a', 'hit-a']));
  assert.ok(ids.indexOf('perp-a') < ids.indexOf('line-a'));
  assert.ok(ids.indexOf('hit-a') < ids.indexOf('line-a'));
  assert.equal(ids.includes('line-b'), false);
  assert.equal(ids.includes('unrelated'), false);
});

test('dependent constructions are detached and published as one state change', async () => {
  const { deleteConstructionsDependingOnPoint } = await pointDependencies();
  const removed = [];
  let changes = 0;
  let constructions = [
    { id: 'line-a', kind: 'line', pointIds: ['point-a', 'point-b'], els: [{ id: 'line-el' }] },
    { id: 'hit-a', kind: 'intersect', lineIds: ['line-a', 'line-b'], els: [{ id: 'hit-el' }] },
    { id: 'line-b', kind: 'line', pointIds: ['point-c', 'point-d'], els: [{ id: 'other-el' }] },
  ];
  const host = {
    getBoard: () => ({ removeObject: (el) => removed.push(el.id) }),
    getConstructions: () => constructions,
    setConstructions: (next) => { constructions = next; },
    onChanged: () => { changes += 1; },
  };

  const ids = deleteConstructionsDependingOnPoint(host, 'point-a');

  assert.deepEqual(ids, ['hit-a', 'line-a']);
  assert.deepEqual(removed, ['hit-el', 'line-el']);
  assert.deepEqual(constructions.map((item) => item.id), ['line-b']);
  assert.equal(changes, 1);
});

