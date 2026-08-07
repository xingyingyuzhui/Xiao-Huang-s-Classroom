/**
 * App session 与分层错误边界（Program 4 Task 4.2）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function load(rel) {
  return import(pathToFileURL(path.join(root, rel)).href);
}

test('session：hub → intro → classroom → hub 状态机', async () => {
  const { createAppSession } = await load('apps/web/src/app/session.js');
  const session = createAppSession();
  const seen = [];
  session.subscribe((s) => seen.push(s.surface));

  assert.equal(session.getState().surface, 'hub');
  assert.equal(session.enterIntro('chemistry'), true);
  assert.equal(session.getState().subjectId, 'chemistry');
  assert.equal(session.getState().transition, 'entering');
  session.enterClassroom('lab');
  assert.equal(session.getState().panelId, 'lab');
  session.returnHub();
  assert.equal(session.getState().surface, 'hub');
  assert.equal(session.getState().subjectId, null);
  assert.deepEqual(seen, ['intro', 'classroom', 'hub']);
});

test('session：非法 subjectId 拒绝；dialog 状态独立', async () => {
  const { createAppSession } = await load('apps/web/src/app/session.js');
  const session = createAppSession();
  assert.equal(session.enterIntro(''), false);
  assert.equal(session.getState().surface, 'hub');
  session.openDialog('confirm');
  assert.equal(session.getState().dialog, 'confirm');
  session.closeDialog();
  assert.equal(session.getState().dialog, null);
});

test('错误边界：panel 错误不级联；classroom 错误隔离；rendererFatal 触发只读回调', async () => {
  const { createErrorBoundary, BOUNDARY_LEVELS } = await load('apps/web/src/app/error-boundary.js');
  assert.deepEqual(BOUNDARY_LEVELS, ['boot', 'classroom', 'panel', 'rendererFatal']);
  const calls = [];
  const boundary = createErrorBoundary({
    onFatal: (e) => calls.push(['fatal', e.level]),
    onClassroomError: (e) => calls.push(['classroom', e.level]),
    onPanelError: (e) => calls.push(['panel', e.level]),
  });
  // panel 错误
  const r = boundary.panel('graph', () => {
    throw new Error('panel exploded');
  });
  assert.equal(r.level, 'panel');
  assert.deepEqual(calls.at(-1), ['panel', 'panel']);
  // classroom 错误
  boundary.classroom('chem', () => {
    throw new Error('classroom exploded');
  });
  assert.deepEqual(calls.at(-1), ['classroom', 'classroom']);
  // renderer fatal：面板级隔离，但 level 标记进入只读
  boundary.rendererFatal('graph', new Error('renderer failed'));
  assert.deepEqual(calls.at(-1), ['panel', 'rendererFatal']);
  // boot fatal：唯一全应用致命层
  boundary.boot('app', new Error('boot exploded'));
  assert.deepEqual(calls.at(-1), ['fatal', 'boot']);
  assert.equal(boundary.getErrors().length, 4);
  boundary.clear('panel');
  assert.equal(boundary.getErrors().length, 3);
});
