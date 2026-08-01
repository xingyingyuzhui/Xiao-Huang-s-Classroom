const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function records() {
  return import(
    pathToFileURL(
      path.join(root, 'apps/web/src/math/graph/construction/records.js'),
    ).href
  );
}

test('construction records distinguish finite segments from extendable support lines', async () => {
  const { canExtendConstr, constrIsInfinite, pointLiesOnConstr } = await records();
  const segment = {
    kind: 'segment',
    extend: false,
    els: [
      {
        elType: 'segment',
        point1: { X: () => 0, Y: () => 0 },
        point2: { X: () => 2, Y: () => 0 },
      },
    ],
  };

  assert.equal(canExtendConstr(segment), true);
  assert.equal(constrIsInfinite(segment), false);
  assert.equal(pointLiesOnConstr(segment, 1, 0), true);
  assert.equal(pointLiesOnConstr(segment, 3, 0), false);

  segment.extend = true;
  assert.equal(constrIsInfinite(segment), true);
  assert.equal(pointLiesOnConstr(segment, 3, 0), true);
});
