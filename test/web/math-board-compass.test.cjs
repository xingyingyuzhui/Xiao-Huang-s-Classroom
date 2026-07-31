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
});

test('graph wires compass add-point and point option hooks', () => {
  const src = fs.readFileSync(path.join(root, 'apps/web/src/math/graph/index.js'), 'utf8');
  assert.match(src, /attachBoardCompass/);
  assert.match(src, /add-point/);
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
  assert.match(src, /math-point-delete-btn/);
  assert.match(src, /setPointOptionHooks/);
  assert.match(src, /deletePoint/);
});

test('math classroom dismisses compass with overlays', () => {
  const src = fs.readFileSync(
    path.join(root, 'apps/web/src/subjects/classrooms/math-classroom.js'),
    'utf8',
  );
  assert.match(src, /dismissBoardCompass/);
  assert.match(src, /dismissMathOverlays/);
});
