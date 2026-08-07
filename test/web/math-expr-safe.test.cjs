/**
 * 安全表达式编译
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

test('compileMathExpr evaluates polynomials and sin', async () => {
  const { compileMathExpr, formatExprLabel } = await load('apps/web/src/math/shared/expr-safe.js');
  const q = compileMathExpr('0.5x^2-x-1.5');
  assert.equal(q.ok, true);
  if (q.ok) {
    assert.ok(Math.abs(/** @type {number} */ (q.fn(2)) - (0.5 * 4 - 2 - 1.5)) < 1e-9);
  }
  const s = compileMathExpr('sin(x)');
  assert.equal(s.ok, true);
  if (s.ok) {
    assert.ok(Math.abs(/** @type {number} */ (s.fn(0))) < 1e-9);
  }
  const bad = compileMathExpr('alert(1)');
  assert.equal(bad.ok, false);
  assert.match(formatExprLabel('x^2'), /^y = /);
});

test('graph sidebar multi-fn list markup and wiring', () => {
  const html = fs.readFileSync(
    path.join(root, 'apps/web/src/subjects/classrooms/partials/math-panels.partial.html'),
    'utf8',
  );
  const graph = fs.readFileSync(path.join(root, 'apps/web/src/math/graph/index.js'), 'utf8');
  const panel = fs.readFileSync(
    path.join(root, 'apps/web/src/math/graph/function-panel.js'),
    'utf8',
  );
  const records = fs.readFileSync(
    path.join(root, 'apps/web/src/math/graph/function-records.js'),
    'utf8',
  );
  const fnRuntime = fs.readFileSync(
    path.join(root, 'apps/web/src/math/graph/graph-function-runtime.js'),
    'utf8',
  );
  const css = fs.readFileSync(
    path.join(root, 'apps/web/src/shared/styles/_math-classroom.css'),
    'utf8',
  );
  assert.match(html, /id="mathFnList"/);
  // 添加按钮由 @xiaohuang/ui createButton 渲染（Program 3 试点），HTML 不再静态保留
  assert.doesNotMatch(html, /id="btnMathAddFn"/);
  assert.match(panel, /@xiaohuang\/ui/, 'function-panel 必须消费 ui 包');
  assert.match(panel, /createButton/, '添加按钮必须经 createButton 渲染');
  assert.match(html, /id="mathFnExprInput"/);
  // 添加函数改为弹窗 + 表达式专属键盘
  assert.match(html, /id="mathFnAddModal"/);
  assert.match(html, /id="mathFnExprKeypad"/);
  assert.match(html, /data-expr-key/);
  // 编辑删除叉：左上角（对齐化学 mol-card-del）
  assert.match(css, /\.math-fn-card-del[\s\S]*top:\s*-6px/);
  assert.match(css, /\.math-fn-card-del[\s\S]*left:\s*-6px/);
  assert.match(css, /\.math-fn-list\.is-edit-mode\s+\.math-fn-card-del/);
  assert.match(panel, /addPreset|addCustom/);
  assert.match(records, /compileMathExpr/);
  assert.match(graph, /state\.functions/);
  assert.match(graph, /listFollowTargets/);
  const toolSrc = fs.readFileSync(
    path.join(root, 'apps/web/src/math/graph/graph-tool-controller.js'),
    'utf8',
  );
  assert.match(graph, /findFunctionIntersectionNear/);
  assert.match(toolSrc, /成为交点/);
  assert.match(panel, /applyExpressionKey/);
  // 删除：先 detach 曲线再 filter，避免幽灵曲线（曲线生命周期在 function-runtime 模块）
  assert.match(fnRuntime, /function detachFnCurve/);
  assert.match(fnRuntime, /function createFnCurve/);
  assert.match(fnRuntime, /function paintActiveFeatureMarks/);
  assert.match(panel, /detachFunctionCurve\(record\)/);
  assert.match(panel, /function remove[\s\S]*detachFunctionCurve[\s\S]*filter/);
});
