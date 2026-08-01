const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const graphDir = path.join(root, 'apps/web/src/math/graph');

function read(relative) {
  return fs.readFileSync(path.join(graphDir, relative), 'utf8');
}

test('graph orchestrator delegates user-point lifecycle to a focused controller', () => {
  const controllerPath = path.join(graphDir, 'user-points.js');
  assert.equal(fs.existsSync(controllerPath), true, 'user-points.js is required');
  const controller = read('user-points.js');
  const orchestrator = read('index.js');

  assert.match(controller, /export function createUserPointController/);
  assert.match(orchestrator, /createUserPointController/);
  assert.doesNotMatch(orchestrator, /function createUserPoint\s*\(/);
  assert.doesNotMatch(orchestrator, /function snapshotUserPoints\s*\(/);
  assert.doesNotMatch(orchestrator, /function deleteUserPoint\s*\(/);
});

test('graph orchestrator delegates pure function analysis', () => {
  const analysisPath = path.join(graphDir, 'function-analysis.js');
  assert.equal(fs.existsSync(analysisPath), true, 'function-analysis.js is required');
  const analysis = read('function-analysis.js');
  const orchestrator = read('index.js');

  assert.match(analysis, /export function evaluateGraphFunction/);
  assert.match(analysis, /export function findFunctionIntersectionNear/);
  assert.match(orchestrator, /from '.\/function-analysis\.js'/);
  assert.doesNotMatch(orchestrator, /function evalFnY\s*\(/);
  assert.doesNotMatch(orchestrator, /function findIntersectionNear\s*\(/);
});

test('graph orchestrator delegates function collection UI and record creation', () => {
  for (const file of ['function-records.js', 'function-panel.js']) {
    assert.equal(fs.existsSync(path.join(graphDir, file)), true, `${file} is required`);
  }
  const orchestrator = read('index.js');
  assert.match(read('function-panel.js'), /export function createFunctionPanelController/);
  assert.match(read('function-records.js'), /export function createPresetFunctionRecord/);
  assert.match(orchestrator, /createFunctionPanelController/);
  assert.doesNotMatch(orchestrator, /function renderFnList\s*\(/);
  assert.doesNotMatch(orchestrator, /function bindFnListUi\s*\(/);
  assert.doesNotMatch(orchestrator, /function showAiFnModal\s*\(/);
  assert.ok(
    orchestrator.split('\n').length < 2150,
    'graph/index.js should stay a thin orchestration entry (plan: <900 after Task 8/17 splits)',
  );
});

test('graph document architecture files exist and stay DOM/JSXGraph-free', () => {
  for (const file of [
    'graph-document.js',
    'graph-store.js',
    'graph-history.js',
    'graph-persistence.js',
    'graph-runtime.js',
    'graph-renderer.js',
  ]) {
    assert.equal(fs.existsSync(path.join(graphDir, file)), true, `${file} is required`);
  }
  // 文档模型 / store / history / persistence 是纯逻辑层：禁止直接 import jsxgraph
  // 或调用浏览器全局 API（参数名 document 不算；这里只拦真实 DOM 调用）
  const pureLayers = ['graph-document.js', 'graph-store.js', 'graph-history.js', 'graph-persistence.js'];
  const domApiPattern =
    /(document|window)\.(querySelector|getElementById|createElement|addEventListener|getComputedStyle|matchMedia|localStorage|requestAnimationFrame|ResizeObserver)/;
  for (const file of pureLayers) {
    const src = read(file);
    assert.doesNotMatch(src, /from\s+['"]jsxgraph['"]/, `${file} must not import jsxgraph`);
    assert.doesNotMatch(src, /from\s+['"]\.\.\/shared\/jsx-board\.js['"]/, `${file} must not import jsx-board`);
    assert.doesNotMatch(src, domApiPattern, `${file} must not touch browser globals`);
  }
});
