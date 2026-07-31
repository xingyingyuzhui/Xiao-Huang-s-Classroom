/**
 * 多曲线跟随目标：最近吸附契约
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const root = require('../helpers/repo-root.js');

async function load(rel) {
  return import(pathToFileURL(path.join(root, rel)).href);
}

test('findNearestFollowTarget picks closest within tol', async () => {
  const {
    findNearestFollowTarget,
    findClosestFollowTarget,
    makeFunctionCurveTarget,
    getFollowTargetById,
  } = await load('apps/web/src/math/shared/follow-target.js');

  const f1 = makeFunctionCurveTarget({
    id: 'graph:main',
    label: '主函数',
    el: { id: 'c1' },
    evalY: (x) => x * x,
  });
  const f2 = makeFunctionCurveTarget({
    id: 'graph:f2',
    label: '第二条',
    el: { id: 'c2' },
    evalY: (x) => x + 1,
  });
  const targets = [f1, f2];

  // 点 (1, 1.05) 离 y=x² 很近，离 y=x+1 较远
  const hit = findNearestFollowTarget(1, 1.05, targets, 0.2);
  assert.ok(hit);
  assert.equal(hit.target.id, 'graph:main');
  assert.ok(hit.distance < 0.1);

  // 点 (1, 2.02) 更近 y=x+1
  const hit2 = findNearestFollowTarget(1, 2.02, targets, 0.2);
  assert.ok(hit2);
  assert.equal(hit2.target.id, 'graph:f2');

  // 容差外
  assert.equal(findNearestFollowTarget(0, 5, targets, 0.2), null);

  // 不限容差仍能选最近：y=x² 在 0 处为 0（距 5）；y=x+1 为 1（距 4）→ f2
  const any = findClosestFollowTarget(0, 5, targets);
  assert.ok(any);
  assert.equal(any.target.id, 'graph:f2');


  assert.equal(getFollowTargetById('graph:main', targets)?.label, '主函数');
  assert.equal(f1.snap(2, 0)?.y, 4);
});

test('graph uses followTargetId + listFollowTargets', () => {
  const src = fs.readFileSync(path.join(root, 'apps/web/src/math/graph/index.js'), 'utf8');
  assert.match(src, /MAIN_CURVE_FOLLOW_ID/);
  assert.match(src, /listFollowTargets/);
  assert.match(src, /followTargetId/);
  assert.match(src, /findNearestFollowTarget|hitFollowNear/);
  assert.match(src, /makeFunctionCurveTarget/);
});
