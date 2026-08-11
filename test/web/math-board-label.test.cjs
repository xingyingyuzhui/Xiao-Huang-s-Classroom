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

  const { formatElementCoordsLabel } = mod;
  const el = {
    _mathBaseName: 'H',
    _mathShowCoords: true,
    X: () => 1.5,
    Y: () => 2,
  };
  assert.equal(formatElementCoordsLabel(el), 'H(1.5, 2)');
  el._mathShowCoords = false;
  assert.equal(formatElementCoordsLabel(el), 'H');
});

test('lineLabelAnchorOnViewportRim prefers inset board edge', async () => {
  const mod = await import(
    pathToFileURL(path.join(root, 'apps/web/src/math/shared/board-label.js')).href
  );
  const { lineLabelAnchorOnViewportRim, offsetPointOffLine } = mod;
  const board = {
    getBoundingBox: () => [-10, 10, 10, -10],
  };
  const p1 = { X: () => 0, Y: () => 0 };
  const p2 = { X: () => 1, Y: () => 0 }; // 水平线
  const a = lineLabelAnchorOnViewportRim(board, p1, p2, 0.1);
  assert.ok(a);
  // 内缩 10% → 右缘 x≈8，并沿法向离开线身（y≠0）
  assert.ok(Math.abs(a.x - 8) < 1e-6);
  assert.ok(Math.abs(a.y) > 0.2);

  const off = offsetPointOffLine(0, 0, 1, 0, { distance: 0.5, towardX: 0, towardY: 1 });
  assert.ok(Math.abs(off.x) < 1e-9);
  assert.ok(Math.abs(off.y - 0.5) < 1e-9);
});

test('board-label uses function text without continuous autoPosition', async () => {
  const mod = await import(
    pathToFileURL(path.join(root, 'apps/web/src/math/shared/board-label.js')).href
  );
  assert.equal(typeof mod.bindLiveLabel, 'function');
  assert.equal(typeof mod.applyBoardLabel, 'function');
  assert.equal(typeof mod.boardLabelAttrs, 'function');
  assert.equal(typeof mod.attachMidpointMeasureLabel, 'function');
  assert.equal(typeof mod.lineLabelAnchorOnViewportRim, 'function');
  assert.equal(mod.BOARD_LABEL_ATTR.autoPosition, false);
  assert.equal(mod.BOARD_PATH_LABEL_ATTR.autoPosition, false);

  const src = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/board-label.js'),
    'utf8',
  );
  assert.match(src, /label\.setText\(content\)/);
  assert.match(src, /autoPosition:\s*false/);
  assert.match(src, /_mathSchedulePointLabelFusion/);
  assert.match(src, /viewport-rim/);
});

test('graph and construction renderers wire autoPosition labels', () => {
  const graph = fs.readFileSync(path.join(root, 'apps/web/src/math/graph/index.js'), 'utf8');
  const draw = ['render-lines.js', 'render-perpendiculars.js']
    .map((file) => fs.readFileSync(path.join(root, 'apps/web/src/math/graph/construction', file), 'utf8'))
    .join('\n');
  assert.match(graph, /boardLabelAttrs/);
  assert.match(draw, /attachMidpointMeasureLabel/);
  assert.match(draw, /measureLabelPlacementFor/);
  // 直线 / 线段 / 切线 / 垂线 都走统一放置
  assert.match(draw, /measureLabelPlacementFor\(kind\)/);
  assert.match(draw, /measureLabelPlacementFor\('tangent'\)/);
  assert.match(draw, /measureLabelPlacementFor\('perp'\)/);
  assert.doesNotMatch(draw, /scheduleLabelLayout/);
});

test('measureLabelPlacementFor covers all construction kinds', async () => {
  const mod = await import(
    pathToFileURL(path.join(root, 'apps/web/src/math/shared/board-label.js')).href
  );
  const { measureLabelPlacementFor, measureLabelOffsetDistance } = mod;
  assert.equal(measureLabelPlacementFor('segment'), 'mid');
  assert.equal(measureLabelPlacementFor('perp'), 'mid');
  assert.equal(measureLabelPlacementFor('line'), 'viewport-rim');
  assert.equal(measureLabelPlacementFor('tangent'), 'viewport-rim');
  const d = measureLabelOffsetDistance({ getBoundingBox: () => [-10, 10, 10, -10] });
  assert.ok(d > 0.2);
});
