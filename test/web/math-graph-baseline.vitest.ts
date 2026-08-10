/**
 * 函数画布基线：锁定重构前既有模块的公开 API 与数值行为。
 *
 * 后续 Task 引入 GraphDocument/store 时不得破坏这些既有契约；
 * 该文件不依赖 jsxgraph，可在纯 Node 下运行。
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import root from '../helpers/repo-root.js';

const graphDir = path.join(root, 'apps/web/src/math/graph');

function read(relative) {
  return fs.readFileSync(path.join(graphDir, relative), 'utf8');
}

async function load(relative) {
  return import(pathToFileURL(path.join(graphDir, relative)).href);
}

test('graph package keeps its module inventory', () => {
  const expected = [
    'index.js',
    'model.js',
    'tool-definitions.js',
    'draw-tools.js',
    'user-points.js',
    'function-records.js',
    'function-analysis.js',
    'function-panel.js',
  ];
  for (const file of expected) {
    assert.equal(fs.existsSync(path.join(graphDir, file)), true, `${file} is required`);
  }
});

test('model.js exports the preset catalogue and feature math', async () => {
  const mod = await load('model.js');
  assert.deepEqual(
    mod.GRAPH_PRESETS.map((p) => p.id),
    [
      'linear',
      'quadratic',
      'power',
      'exp',
      'log',
      'abs',
      'inverse',
      'sine',
      'cosine',
    ],
  );
  assert.equal(typeof mod.evalPreset, 'function');
  assert.equal(typeof mod.sampleCurve, 'function');
  assert.equal(typeof mod.asymptotes, 'function');
  assert.equal(typeof mod.keyFeatures, 'function');
  assert.equal(typeof mod.formulaText, 'function');
  assert.equal(typeof mod.defaultCoeffsFor, 'function');
  assert.deepEqual(mod.DEFAULT_COEFFS, { a: 1, b: 0, c: 0 });

  // 数值行为基线：二次函数 f(x)=x^2-2x+1 = (x-1)^2
  assert.equal(mod.evalPreset('quadratic', { a: 1, b: -2, c: 1 }, 0), 1);
  assert.equal(mod.evalPreset('quadratic', { a: 1, b: -2, c: 1 }, 1), 0);
  assert.equal(mod.evalPreset('quadratic', { a: 1, b: -2, c: 1 }, 2), 1);
  // 定义域外（log 负数）不返回有限数
  const logNeg = mod.evalPreset('log', { a: 1, b: 0, c: 0 }, -1);
  assert.ok(logNeg == null || !Number.isFinite(logNeg));
});

test('function-records.js keeps the current record shape', async () => {
  const mod = await load('function-records.js');
  assert.equal(typeof mod.createPresetFunctionRecord, 'function');
  assert.equal(typeof mod.createCustomFunctionRecord, 'function');
  assert.equal(typeof mod.createFunctionRecordFromAiSpec, 'function');

  const preset = mod.createPresetFunctionRecord({ preset: 'quadratic' });
  assert.equal(preset.kind, 'preset');
  assert.equal(preset.preset, 'quadratic');
  assert.equal(preset.visible, true);
  // 记录只保存持久字段：不携带曲线元素或编译求值函数
  assert.equal('curve' in preset, false);
  assert.equal('evalFn' in preset, false);
  assert.equal(preset.locked, false);
  assert.deepEqual(preset.domain, { mode: 'viewport' });

  const custom = mod.createCustomFunctionRecord({ raw: 'x^2' });
  assert.equal(custom.ok, true);
  assert.equal(custom.record.kind, 'custom');
  assert.equal(custom.record.expr, 'x^2');
  assert.equal('evalFn' in custom.record, false);
  assert.equal('curve' in custom.record, false);

  const bad = mod.createCustomFunctionRecord({ raw: 'x^(' });
  assert.equal(bad.ok, false);
  assert.equal(bad.record, null);
  assert.equal(typeof bad.error, 'string');
});

test('function-analysis.js keeps pure evaluation entry points', async () => {
  const mod = await load('function-analysis.js');
  assert.equal(typeof mod.evaluateGraphFunction, 'function');
  assert.equal(typeof mod.graphFunctionDisplayLabel, 'function');
  assert.equal(typeof mod.presetValueTable, 'function');
  assert.equal(typeof mod.findFunctionIntersectionNear, 'function');
  assert.equal(typeof mod.recomputeFunctionIntersection, 'function');

  const fn = { kind: 'preset', preset: 'linear', coeffs: { a: 2, b: 1, c: 0 }, visible: true };
  assert.equal(mod.evaluateGraphFunction(fn, 3), 7);
  assert.equal(mod.evaluateGraphFunction({ ...fn, visible: false }, 3), null);
});

test('tool-definitions.js keeps the stable tool list', () => {
  const src = read('tool-definitions.js');
  assert.match(src, /GRAPH_BOARD_TOOLS/);
  for (const id of ['select', 'point', 'segment', 'line', 'tangent', 'perp-axis', 'intersect', 'delete']) {
    assert.match(src, new RegExp(`id: '${id}'`));
  }
});

test('user-points.js exposes the controller factory', () => {
  const src = read('user-points.js');
  assert.match(src, /export function createUserPointController/);
  // 控制器方法面：create/delete/find/removeAll/restore/setFollow/setShowCoords/snapshot
  assert.match(src, /create\s*[,:]/);
  assert.match(src, /snapshot\s*[,:]/);
  assert.match(src, /setFollow\s*[,:]/);
  assert.match(src, /setShowCoords\s*[,:]/);
});
