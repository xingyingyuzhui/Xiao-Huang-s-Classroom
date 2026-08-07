/**
 * 数学教室 partial / 课标命名契约（对齐化学多 Tab 实验室）
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

test('math panels partial has side-drawer + stage for each lab tab', () => {
  const html = fs.readFileSync(
    path.join(root, 'apps/web/src/subjects/classrooms/partials/math-panels.partial.html'),
    'utf8',
  );
  for (const id of [
    'panel-math-graph',
    'panel-math-plane',
    'panel-math-trig',
    'panel-math-sequence',
    'panel-math-solid',
    'panel-math-ai',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /class="sidebar side-drawer"/);
  assert.match(html, /class="stage stage-math/);
  assert.match(html, /math-float-card/);
  assert.match(html, /id="mathGraphBoard"/);
  assert.match(html, /id="mathPlaneBoard"/);
  assert.match(html, /id="mathTrigCircleBoard"/);
  assert.match(html, /id="mathSeqBoard"/);
  assert.match(html, /id="mathSolidCanvasHost"/);
  assert.match(html, /概念讲解/);
  assert.match(html, /id="btnMathExplain"/);
  assert.doesNotMatch(html, /二次一族/);
  assert.doesNotMatch(html, /知识地图/);
  assert.doesNotMatch(html, /图象实验室/);
  assert.doesNotMatch(html, /mathAtlas/);
});

test('math classroom catalog labels use curriculum language', () => {
  const catalog = fs.readFileSync(
    path.join(root, 'packages/subject-settings/src/tab-catalog.ts'),
    'utf8',
  );
  assert.match(catalog, /函数画布/);
  assert.match(catalog, /直线与圆/);
  assert.match(catalog, /三角函数/);
  assert.match(catalog, /数列/);
  assert.match(catalog, /立体几何/);
  assert.match(catalog, /课堂/);
  assert.doesNotMatch(catalog, /二次一族/);
  assert.doesNotMatch(catalog, /知识地图/);
});

test('math classroom explain API is wired on server and client', () => {
  const lessonRoute = fs.readFileSync(
    path.join(root, 'apps/server/src/routes/ai/lesson.js'),
    'utf8',
  );
  const lessonService = fs.readFileSync(
    path.join(root, 'apps/server/src/services/ai/lesson-service.js'),
    'utf8',
  );
  const client = fs.readFileSync(path.join(root, 'apps/web/src/shared/api/client.js'), 'utf8');
  const aiRoot = fs.readFileSync(path.join(root, 'apps/server/src/routes/ai.js'), 'utf8');
  assert.match(lessonRoute, /\/lesson\/explain/);
  assert.match(lessonService, /高中数学老师/);
  assert.match(client, /lessonExplain/);
  assert.match(aiRoot, /ai\/lesson/);
});

test('math board nav order is 复原 缩小 放大 左 右 上 下', () => {
  const jsx = fs.readFileSync(path.join(root, 'apps/web/src/math/shared/jsx-board.js'), 'utf8');
  const css = fs.readFileSync(
    path.join(root, 'apps/web/src/shared/styles/_math-classroom.css'),
    'utf8',
  );
  assert.match(jsx, /MATH_NAV_ORDER\s*=\s*\[\s*'100',\s*'out',\s*'in',\s*'left',\s*'right',\s*'up',\s*'down'\s*\]/);
  assert.match(jsx, /polishMathNavigation/);
  assert.match(jsx, /100:\s*'复原'/);
  assert.match(jsx, /out:\s*'缩小'/);
  assert.match(jsx, /in:\s*'放大'/);
  assert.match(css, /JXG_navigation_button_100/);
  assert.match(css, /JXG_navigation_button_out/);
});
