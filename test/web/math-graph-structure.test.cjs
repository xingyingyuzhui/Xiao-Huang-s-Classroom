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
  // 拆分后只允许装配与公共入口；readouts/曲线/工具逻辑在独立模块
  assert.match(orchestrator, /createGraphDocumentRenderer/);
  assert.match(orchestrator, /createGraphToolController/);
  assert.match(orchestrator, /createGraphFunctionRuntime/);
  assert.ok(
    orchestrator.split('\n').length < 700,
    'graph/index.js 必须保持编排入口（Task 8 最终阈值 <700）',
  );
});

test('graph orchestrator keeps probe/analysis/readouts/transform/mount/follow internals out of index', () => {
  const orchestrator = read('index.js');
  // 职责 → [模块文件, index 必须委托的导出, index 禁止出现的函数定义（内联特征）]
  const contracts = [
    ['probe-controller.js', 'createProbeController', /function (renderReadout|samplesAt)\s*\(/],
    ['numeric-analysis-runner.js', 'createNumericAnalysisRunner', /function (analyze|invalidateKey)\s*\(/],
    ['graph-readouts.js', 'createGraphReadouts', /function (formatProbeNumber|escapeHtml)\s*\(/],
    ['transform-model.js', 'describePresetTransform', /function (normalizeCoeffs|scaleText)\s*\(/],
    ['graph-mount-controller.js', 'createGraphMountController', /function (ensurePreset|openCoeffTransaction)\s*\(/],
    ['graph-follow-targets.js', 'createGraphFollowTargets', /function (mirrorActiveToLegacy|followIdForFn)\s*\(/],
  ];
  for (const [file, delegatedExport, inlineFeature] of contracts) {
    assert.equal(fs.existsSync(path.join(graphDir, file)), true, `${file} is required`);
    assert.match(read(file), new RegExp(`export function ${delegatedExport}`), `${file} must export ${delegatedExport}`);
    assert.match(orchestrator, new RegExp(delegatedExport), `index must delegate to ${delegatedExport}`);
    assert.doesNotMatch(orchestrator, inlineFeature, `index must not inline ${file} implementation`);
  }
});

/** 纯逻辑层白名单（B2）：只允许纯数据/数值/校验/迁移，禁止 jsxgraph、DOM API、渲染层。 */
const PURE_LAYERS = [
  'graph-document.js',
  'graph-store.js',
  'graph-history.js',
  'graph-persistence.js',
  'graph-document-migrations.js',
  'graph-record-validation.js',
  'graph-id-allocator.js',
  'function-analysis.js',
  'function-records.js',
  'function-evaluator.js',
  'numeric-features.js',
  'numeric-analysis-runner.js',
  'transform-model.js',
  'probe-model.js',
  'rate-of-change.js',
  'tool-definitions.js',
  'model.js',
  'construction/function-roots.js',
];

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
  // 纯逻辑层（B2 扩展）：禁止 import jsxgraph / jsx-board / 渲染层，禁止调用
  // 浏览器全局 API（参数名 document 不算；这里只拦真实 DOM 调用）
  const domApiPattern =
    /(document|window)\.(querySelector|getElementById|createElement|addEventListener|getComputedStyle|matchMedia|localStorage|requestAnimationFrame|ResizeObserver)/;
  for (const file of PURE_LAYERS) {
    const src = read(file);
    assert.doesNotMatch(src, /from\s+['"]jsxgraph['"]/, `${file} must not import jsxgraph`);
    assert.doesNotMatch(src, /from\s+['"]\.\.\/shared\/jsx-board\.js['"]/, `${file} must not import jsx-board`);
    assert.doesNotMatch(
      src,
      /from\s+['"]\.\/graph-(renderer|document-renderer)\.js['"]/,
      `${file} must not import renderer layer`,
    );
    assert.doesNotMatch(src, domApiPattern, `${file} must not touch browser globals`);
  }
});
