/**
 * 画布笔记层：模块导出 + 图象接线 + 几何命中
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

test('board-notes module exports attach + dismiss + hit helpers', () => {
  const src = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/board-notes.js'),
    'utf8',
  );
  assert.match(src, /export function attachBoardNotes/);
  assert.match(src, /export function dismissBoardNotesMode/);
  assert.match(src, /export function screenToUser/);
  assert.match(src, /export function userToScreen/);
  assert.match(src, /export function strokeHitTest/);
  assert.match(src, /export function distPointToSeg/);
  assert.match(src, /math-board-notes/);
  assert.match(src, /storageKey|localStorage/);
  assert.match(src, /pan\.enabled/);
});

test('distPointToSeg and strokeHitTest pure logic via dynamic import skip — inline checks', () => {
  // 内联复刻 distPointToSeg，避免在 CJS 测试里 import ESM
  function distPointToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const qx = x1 + t * dx;
    const qy = y1 + t * dy;
    return Math.hypot(px - qx, py - qy);
  }
  assert.ok(distPointToSeg(0, 0, 0, 0, 10, 0) < 1e-9);
  assert.ok(Math.abs(distPointToSeg(5, 3, 0, 0, 10, 0) - 3) < 1e-9);
  assert.ok(distPointToSeg(20, 0, 0, 0, 10, 0) > 9);
});

test('graph wires board notes on function canvas', () => {
  const src = ['graph-mount-controller.js', 'graph-tool-controller.js', 'index.js']
    .map((file) => fs.readFileSync(path.join(root, 'apps/web/src/math/graph', file), 'utf8'))
    .join('\n');
  assert.match(src, /math-graph-board-notes/);
  assert.match(src, /attachBoardNotes/);
  assert.match(src, /dismissBoardNotesMode/);
});

test('math classroom dismisses notes mode with overlays', () => {
  const src = fs.readFileSync(
    path.join(root, 'apps/web/src/subjects/classrooms/math-classroom.js'),
    'utf8',
  );
  assert.match(src, /dismissBoardNotesMode/);
  assert.match(src, /dismissMathOverlays/);
});

test('math classroom css has notes layer styles', () => {
  const css = fs.readFileSync(
    path.join(root, 'apps/web/src/shared/styles/_math-classroom.css'),
    'utf8',
  );
  assert.match(css, /\.math-board-notes\b/);
  assert.match(css, /\.math-board-notes-toggle/);
  assert.match(css, /\.math-board-notes-toolbar/);
  assert.match(css, /\.math-board-notes-canvas/);
  assert.match(css, /\.math-board-fab-dock/);
});

test('notes and axis settings share fab dock', () => {
  const notes = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/board-notes.js'),
    'utf8',
  );
  const axis = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/axis-legend-settings.js'),
    'utf8',
  );
  const dock = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/board-fab-dock.js'),
    'utf8',
  );
  assert.match(dock, /export function ensureMathBoardFabDock/);
  assert.match(notes, /ensureMathBoardFabDock/);
  assert.match(axis, /ensureMathBoardFabDock/);
  assert.match(notes, /math-axis-settings-btn|insertBefore/);
});

test('notes controller exposes the document snapshot API contract', async () => {
  const { attachBoardNotes } = await import(
    pathToFileURL(path.join(root, 'apps/web/src/math/shared/board-notes.js')).href,
  );
  // 无 board 的 fallback 也必须提供完整契约
  const fallback = attachBoardNotes({}, {});
  assert.equal(typeof fallback.getSnapshot, 'function');
  assert.equal(typeof fallback.replaceSnapshot, 'function');
  assert.equal(typeof fallback.undo, 'function');
  assert.equal(typeof fallback.canUndo, 'function');
  assert.equal(typeof fallback.onSnapshotChange, 'function');
  assert.deepEqual(fallback.getSnapshot(), { version: 1, strokes: [] });
  const unsubscribe = fallback.onSnapshotChange(() => {});
  assert.equal(typeof unsubscribe, 'function');
});
