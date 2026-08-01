/**
 * 长按罗盘 + 函数图象加点接线
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

test('board-compass module exports attach + dismiss', () => {
  const src = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/board-compass.js'),
    'utf8',
  );
  assert.match(src, /export function attachBoardCompass/);
  assert.match(src, /export function dismissBoardCompass/);
  assert.match(src, /HOLD_MS|holdMs/);
  assert.match(src, /add-point|加点/);
  assert.doesNotMatch(src, /icon \|\| '·'/);
  assert.doesNotMatch(src, /math-board-compass-icon/);
});

test('graph wires compass one-shot back to select', () => {
  const src = ['index.js', 'user-points.js']
    .map((file) => fs.readFileSync(path.join(root, 'apps/web/src/math/graph', file), 'utf8'))
    .join('\n');
  assert.match(src, /toolOneShot/);
  assert.match(src, /finishOneShotToolIfDone/);
  assert.match(src, /oneShot:\s*true/);
  assert.match(src, /bindPointIntegerSnap/);
  assert.match(src, /shouldSuppressHold/);
});

test('compass suppresses hold while dragging points', () => {
  const src = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/board-compass.js'),
    'utf8',
  );
  assert.match(src, /shouldSuppressHold/);
  assert.match(src, /shouldAllowHoldDespiteDrag/);
  assert.match(src, /boardIsDraggingObject|mouse\.obj/);
  // 平移 MOVE_ORIGIN(=2) 不得当成拖对象，否则空白长按永远不出罗盘
  assert.doesNotMatch(src, /mode === 2/);
  assert.match(src, /BOARD_MODE_DRAG/);
});

test('graph wires compass add-point and point option hooks', () => {
  const src = fs.readFileSync(path.join(root, 'apps/web/src/math/graph/index.js'), 'utf8');
  assert.match(src, /attachBoardCompass/);
  assert.match(src, /GRAPH_BOARD_TOOLS|id:\s*'point'|加点/);
  assert.match(src, /setPointOptionHooks/);
  assert.match(src, /createUserPoint|addPointAt/);
  assert.match(src, /跟随函数|listFollowTargets|hitFollowNear/);
  assert.match(src, /showCoords|_mathShowCoords/);
  assert.match(src, /deleteUserPoint|deletePoint/);
});

test('style bubble has point options fields', () => {
  const src = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/object-style-panel.js'),
    'utf8',
  );
  assert.match(src, /data-field="pointOptions"/);
  assert.match(src, /data-role="showCoords"/);
  assert.match(src, /data-role="followCurve"/);
  assert.match(src, /data-role="deletePoint"/);
  assert.match(src, /data-role="deletePointInline"/);
  assert.match(src, /data-field="lineOptions"/);
  assert.match(src, /data-role="extendLine"/);
  assert.match(src, /data-field="objectDelete"/);
  assert.match(src, /math-point-delete-btn/);
  assert.match(src, /setPointOptionHooks/);
  assert.match(src, /deletePoint/);
  assert.match(src, /canExtend|setExtend/);
  assert.match(src, /v8-hidden-extend|lineOptions/);
});

test('construction modules support segment/perp extend rays', () => {
  const src = [
    'render-lines.js',
    'render-perpendiculars.js',
    'intersections.js',
    'records.js',
  ]
    .map((file) => fs.readFileSync(path.join(root, 'apps/web/src/math/graph/construction', file), 'utf8'))
    .join('\n');
  assert.match(src, /_mathExtendRay/);
  assert.match(src, /setConstructionExtend|canExtendConstr/);
  assert.match(src, /pointLiesOnConstr|pointOnSegment/);
  assert.match(src, /formatElementCoordsLabel/);
  assert.match(src, /isExtendStyleTarget/);
  assert.match(src, /_mathIntersectOnBody|bindIntersectVisibility|syncIntersectVisibility/);
  assert.match(src, /supportingLineElOf|lineLineIntersectionCoords/);
  assert.match(src, /visibleLine|lineLikeElOf\(newConstruction\)/);
  assert.doesNotMatch(src, /snapIntersectCoords/);
});

test('board-snap attracts to nearby points and axes', () => {
  const src = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/board-snap.js'),
    'utf8',
  );
  assert.match(src, /export function snapCoordsAdvanced/);
  assert.match(src, /getTargets/);
  assert.match(src, /tolX|snapTolerance/);
});

test('object-select prefers points over lines', () => {
  const src = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/object-select.js'),
    'utf8',
  );
  assert.match(src, /isPointEl|perpendicularpoint/);
  assert.match(src, /NEAR_PX|_mathExtendRay/);
});

test('math classroom dismisses compass with overlays', () => {
  const src = fs.readFileSync(
    path.join(root, 'apps/web/src/subjects/classrooms/math-classroom.js'),
    'utf8',
  );
  assert.match(src, /dismissBoardCompass/);
  assert.match(src, /dismissMathOverlays/);
});
