const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

test('formatSmartNumber strips trailing zeros up to 2 decimals', async () => {
  const mod = await import(
    pathToFileURL(path.join(root, 'apps/web/src/math/shared/board-label.js')).href
  );
  const { formatSmartNumber, formatCoordsPair, formatNamedCoords } = mod;

  assert.equal(formatSmartNumber(1), '1');
  assert.equal(formatSmartNumber(1.0), '1');
  assert.equal(formatSmartNumber(1.5), '1.5');
  assert.equal(formatSmartNumber(1.25), '1.25');
  assert.equal(formatSmartNumber(1.256), '1.26');
  assert.equal(formatSmartNumber(-2), '-2');
  assert.equal(formatSmartNumber(-0.001), '0');
  assert.equal(formatCoordsPair(1, 2), '(1, 2)');
  assert.equal(formatCoordsPair(1.5, 2.0), '(1.5, 2)');
  assert.equal(formatNamedCoords('U1', 1, 1), 'U1(1, 1)');
  assert.equal(formatNamedCoords('顶点', 0, 0), '顶点(0, 0)');
});

test('board-label uses function text and autoPosition', async () => {
  const mod = await import(
    pathToFileURL(path.join(root, 'apps/web/src/math/shared/board-label.js')).href
  );
  assert.equal(typeof mod.bindLiveLabel, 'function');
  assert.equal(typeof mod.applyBoardLabel, 'function');
  assert.equal(typeof mod.boardLabelAttrs, 'function');
  assert.equal(mod.BOARD_LABEL_ATTR.autoPosition, true);

  const src = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/board-label.js'),
    'utf8',
  );
  assert.match(src, /label\.setText\(content\)/);
  assert.match(src, /autoPosition:\s*true/);
});

test('graph and draw-tools wire autoPosition labels', () => {
  const graph = fs.readFileSync(path.join(root, 'apps/web/src/math/graph/index.js'), 'utf8');
  const draw = fs.readFileSync(path.join(root, 'apps/web/src/math/graph/draw-tools.js'), 'utf8');
  assert.match(graph, /boardLabelAttrs/);
  assert.match(draw, /boardLabelAttrs/);
  assert.match(draw, /bindLiveLabel\(el, getText, \[p1, p2\]\)/);
  assert.doesNotMatch(draw, /scheduleLabelLayout/);
});
