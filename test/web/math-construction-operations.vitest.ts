import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

async function operations() {
  return import(
    pathToFileURL(
      path.join(root, 'apps/web/src/math/graph/construction/operations.js'),
    ).href
  );
}

test('deleting a construction cascades to intersections and dependent perpendiculars', async () => {
  const { deleteConstruction } = await operations();
  const removed = [];
  let changes = 0;
  let constructions = [
    { id: 'line-a', kind: 'line', pointIds: ['p1', 'p2'], els: [{ id: 'line-el' }] },
    { id: 'line-b', kind: 'line', pointIds: ['p3', 'p4'], els: [{ id: 'other-el' }] },
    { id: 'perp-a', kind: 'perp', targetConstrId: 'line-a', pointIds: ['p5'], els: [{ id: 'perp-el' }] },
    { id: 'hit-a', kind: 'intersect', lineIds: ['line-a', 'line-b'], els: [{ id: 'hit-el' }] },
  ];
  const host = {
    getBoard: () => ({ removeObject: (el) => removed.push(el.id) }),
    getConstructions: () => constructions,
    setConstructions: (next) => { constructions = next; },
    onChanged: () => { changes += 1; },
  };

  assert.equal(deleteConstruction(host, 'line-a'), true);
  assert.deepEqual(new Set(removed), new Set(['line-el', 'perp-el', 'hit-el']));
  assert.deepEqual(constructions.map((item) => item.id), ['line-b']);
  assert.equal(changes, 1);
});

