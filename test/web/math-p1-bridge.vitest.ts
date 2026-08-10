/**
 * P1：课堂 ↔ 实验台桥 / 主题示范动作
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

async function load(rel) {
  return import(pathToFileURL(path.join(root, rel)).href);
}

test('math topics expose labActions for teacher-demo', async () => {
  const { MATH_CLASSROOM_TOPICS, getMathTopic } = await load(
    'apps/web/src/math/classroom/topics.js',
  );
  const q = getMathTopic('quadratic');
  assert.ok(q?.labActions?.length >= 1);
  assert.equal(q.labActions[0].type, 'setGraph');
  assert.ok(q.labActions[0].coeffs);
  assert.ok(MATH_CLASSROOM_TOPICS.some((t) => t.labActions?.length));
});

test('lab-bridge snapshotToQuizContext formats snapshot', async () => {
  const { snapshotToQuizContext } = await load('apps/web/src/math/shared/lab-bridge.js');
  const text = snapshotToQuizContext({
    tab: 'graph',
    label: '函数画布',
    summary: '二次 · a=1',
    formula: 'y=x^2',
    params: { a: 1 },
  });
  assert.match(text, /函数画布/);
  assert.match(text, /y=x\^2/);
  assert.equal(snapshotToQuizContext(null), '');
});

test('quiz service accepts labContext in source', () => {
  const src = fs.readFileSync(
    path.join(root, 'apps/server/src/services/ai/quiz-service.js'),
    'utf8',
  );
  assert.match(src, /labContext/);
  assert.match(src, /实验台当前状态/);
});

test('math classroom partial has lab action and from-lab quiz hooks', () => {
  const html = fs.readFileSync(
    path.join(root, 'apps/web/src/subjects/classrooms/partials/math-panels.partial.html'),
    'utf8',
  );
  assert.match(html, /id="mathExplainLabActions"/);
  assert.match(html, /id="btnMathQuizFromLab"/);
  assert.match(html, /id="mathQuizLabContext"/);
  assert.doesNotMatch(html, /math-task-host/);
  assert.doesNotMatch(html, /data-step-board/);
  assert.doesNotMatch(html, /探究任务/);
});

test('math lab modules no longer mount task shell', () => {
  for (const rel of [
    'apps/web/src/math/graph/index.js',
    'apps/web/src/math/plane/index.js',
    'apps/web/src/math/trig/index.js',
    'apps/web/src/math/sequence/index.js',
    'apps/web/src/math/solid/index.js',
  ]) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.doesNotMatch(src, /mountTaskShell|task-shell|createQuadraticTaskChain|createPlaneTaskChain/);
  }
  assert.equal(fs.existsSync(path.join(root, 'apps/web/src/math/tasks/task-shell.js')), false);
});
