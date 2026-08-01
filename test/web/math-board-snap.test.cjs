/**
 * board-snap + line intersection math (no JSXGraph)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

test('snapCoordsAdvanced prefers nearby targets then axes then integers', async () => {
  const mod = await import(
    pathToFileURL(path.join(root, 'apps/web/src/math/shared/board-snap.js')).href
  );
  const board = { unitX: 40, unitY: 40 };
  // 靠近已有点
  const toPt = mod.snapCoordsAdvanced(board, 1.05, 2.02, [{ x: 1, y: 2 }]);
  assert.deepEqual(toPt, { x: 1, y: 2 });
  // 贴轴
  const toAxis = mod.snapCoordsAdvanced(board, 0.1, 3.2, []);
  assert.equal(toAxis.x, 0);
  assert.equal(toAxis.y, 3);
  // 整数格
  const toInt = mod.snapCoordsAdvanced(board, 2.1, 4.05, []);
  assert.deepEqual(toInt, { x: 2, y: 4 });
});

test('supporting-line helpers stay in focused construction modules', () => {
  const fs = require('node:fs');
  const geometry = fs.readFileSync(
    path.join(root, 'apps/web/src/math/graph/construction/geometry.js'),
    'utf8',
  );
  const records = fs.readFileSync(
    path.join(root, 'apps/web/src/math/graph/construction/records.js'),
    'utf8',
  );
  assert.match(records, /export function supportingLineElOf/);
  assert.match(geometry, /export function lineLineIntersectionCoords/);
  assert.match(geometry, /\(x1 - x2\) \* \(y3 - y4\)/);
});
