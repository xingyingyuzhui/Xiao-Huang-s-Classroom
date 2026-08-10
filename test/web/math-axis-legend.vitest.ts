/**
 * 坐标轴/图例设置：按钮 + 气泡
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import root from '../helpers/repo-root.js';

test('axis-legend-settings module exports attach and dismiss', () => {
  const src = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/axis-legend-settings.js'),
    'utf8',
  );
  assert.match(src, /export function attachAxisLegendSettings/);
  assert.match(src, /export function dismissAxisLegendBubble/);
  assert.match(src, /snapToInteger/);
  assert.match(src, /画布设置/);
  assert.doesNotMatch(src, /坐标轴与图例/);
  assert.match(src, /showAxisX/);
  assert.match(src, /showGrid/);
  assert.match(src, /showLegend/);
  assert.match(src, /axisStrokeWidth/);
  assert.match(src, /tickStepX/);
  assert.match(src, /tickStepY/);
  assert.match(src, /ticksDistance/);
  assert.match(src, /insertTicks:\s*false/);
  assert.match(src, /fXMin/);
  assert.match(src, /fXMax/);
  assert.match(src, /xMin/);
  assert.match(src, /board\.grids/);
  assert.match(src, /setBoundingBox/);
  assert.match(src, /skipViewport/);
  assert.match(src, /refresh\(\)\s*\{[\s\S]*skipViewport:\s*true/);
  assert.match(src, /math-axis-settings-btn/);
  assert.match(src, /mathAxisLegendBubble/);
  // 重置：头栏 + 底部按钮，恢复 factoryDefaults
  assert.match(src, /data-role="reset"/);
  assert.match(src, /resetToDefaults/);
  assert.match(src, /factoryDefaults|DEFAULT_AXIS_LEGEND_STATE/);
  assert.doesNotMatch(src, /data-role="keepAspect"/);
  assert.doesNotMatch(src, /data-role="showLegend"/);
  assert.match(src, /mountMathNumKeypads/);
  assert.match(src, /hideNumKeypad/);
});

test('graph rebuilds curve from function domain settings', () => {
  const src = fs.readFileSync(path.join(root, 'apps/web/src/math/graph/graph-mount-controller.js'), 'utf8');
  assert.match(src, /onAxisSettingsChange/);
  assert.match(src, /fXMin/);
  assert.match(src, /fXMax/);
  assert.match(src, /hasFuncDomain:\s*true/);
});

test('jsx-board wires axis settings by default', () => {
  const src = fs.readFileSync(path.join(root, 'apps/web/src/math/shared/jsx-board.js'), 'utf8');
  assert.match(src, /axis-legend-settings/);
  assert.match(src, /_mathAxisLegend/);
  assert.match(src, /axisSettings !== false/);
});

test('graph provides legend items for main curve', () => {
  const mountSrc = fs.readFileSync(path.join(root, 'apps/web/src/math/graph/graph-mount-controller.js'), 'utf8');
  const fnRuntimeSrc = fs.readFileSync(path.join(root, 'apps/web/src/math/graph/graph-function-runtime.js'), 'utf8');
  assert.match(mountSrc, /getLegendItems/);
  assert.match(mountSrc, /axisSettingsHost/);
  assert.match(mountSrc, /bindMathThemeRestyle/);
  assert.match(mountSrc, /resolveFunctionColor/);
  // 重建曲线保留视窗 + 图例 refresh 契约（rebuildCurve 在 function-runtime 模块）
  assert.match(fnRuntimeSrc, /withPreservedViewport/);
  assert.match(fnRuntimeSrc, /_mathAxisLegend\?\.refresh/);
});

test('math classroom dismisses axis legend bubble with overlays', () => {
  const src = fs.readFileSync(
    path.join(root, 'apps/web/src/subjects/classrooms/math-classroom.ts'),
    'utf8',
  );
  assert.match(src, /dismissAxisLegendBubble/);
});
