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
    orchestrator.split('\n').length < 1700,
    'graph/index.js should stay a thin orchestration entry',
  );
});
