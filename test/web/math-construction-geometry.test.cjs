const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function geometry() {
  return import(
    pathToFileURL(
      path.join(root, 'apps/web/src/math/graph/construction/geometry.js'),
    ).href
  );
}

test('construction geometry intersects supporting lines and rejects parallel lines', async () => {
  const { lineLineIntersectionCoords } = await geometry();
  const line = (x1, y1, x2, y2) => ({
    point1: { X: () => x1, Y: () => y1 },
    point2: { X: () => x2, Y: () => y2 },
  });

  assert.deepEqual(
    lineLineIntersectionCoords(line(0, 0, 4, 4), line(0, 4, 4, 0)),
    { x: 2, y: 2 },
  );
  assert.equal(lineLineIntersectionCoords(line(0, 0, 1, 1), line(0, 1, 1, 2)), null);
});

test('construction geometry keeps finite intersections on the visible segment body', async () => {
  const { pointOnSegmentCoords } = await geometry();

  assert.equal(pointOnSegmentCoords({ x: 0, y: 0 }, { x: 4, y: 0 }, 2, 0), true);
  assert.equal(pointOnSegmentCoords({ x: 0, y: 0 }, { x: 4, y: 0 }, 4.2, 0), false);
  assert.equal(pointOnSegmentCoords({ x: 1, y: 1 }, { x: 1, y: 1 }, 1.03, 1.02), true);
});

test('construction geometry finds a perpendicular foot on a flat function', async () => {
  const { findPerpFootOnFn } = await geometry();
  const host = {
    getBoard: () => ({ getBoundingBox: () => [-10, 10, 10, -10] }),
    evalFnY: (_fn, _x) => 0,
  };

  const foot = findPerpFootOnFn(host, { id: 'flat' }, 3, 4);
  assert.ok(foot);
  assert.ok(Math.abs(foot.x - 3) < 1e-5);
  assert.ok(Math.abs(foot.y) < 1e-8);
});

test('normal direction stays bounded for near-vertical tangents', async () => {
  const { normalDirectionFromSlope } = await geometry();
  assert.equal(typeof normalDirectionFromSlope, 'function');

  const flat = normalDirectionFromSlope(0);
  assert.deepEqual(flat, { x: 0, y: 1 });

  const steep = normalDirectionFromSlope(1e12);
  assert.ok(Number.isFinite(steep.x));
  assert.ok(Number.isFinite(steep.y));
  assert.ok(Math.hypot(steep.x, steep.y) <= Math.SQRT2);
  assert.ok(Math.abs(steep.x + 1) < 1e-9);
  assert.ok(Math.abs(steep.y) < 1e-9);
});
