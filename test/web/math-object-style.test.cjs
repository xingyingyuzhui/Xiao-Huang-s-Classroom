/**
 * 选中对象样式：纯函数契约 + 模块接线
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function load(rel) {
  return import(pathToFileURL(path.join(root, rel)).href);
}

test('object-style detects kinds and applies dash/width/color patch', async () => {
  const {
    detectObjectKind,
    kindLabel,
    readObjectStyle,
    applyObjectStyle,
    DASH_STYLES,
  } = await load('apps/web/src/math/shared/object-style.js');

  assert.equal(detectObjectKind({ elType: 'line' }), 'line');
  assert.equal(detectObjectKind({ elType: 'functiongraph' }), 'curve');
  assert.equal(detectObjectKind({ elType: 'point' }), 'point');
  assert.equal(kindLabel('line'), '线');
  assert.ok(DASH_STYLES.some((d) => d.dash === 0 && d.label === '实线'));
  assert.ok(DASH_STYLES.some((d) => d.dash === 2 && d.label === '虚线'));

  /** @type {Record<string, unknown>} */
  const visProp = {
    strokecolor: '#b45309',
    strokewidth: 2.5,
    dash: 2,
    fillcolor: '#0f766e',
    fillopacity: 0.2,
    size: 4,
  };
  const el = {
    elType: 'line',
    name: 'AB',
    visProp,
    setAttribute(attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        visProp[k.toLowerCase()] = v;
      }
    },
    getAttribute(key) {
      return visProp[key.toLowerCase()];
    },
  };

  const snap = readObjectStyle(el);
  assert.equal(snap.kind, 'line');
  assert.equal(snap.label, 'AB');
  assert.equal(snap.strokeWidth, 2.5);
  assert.equal(snap.dash, 2);
  assert.equal(snap.hasDash, true);

  applyObjectStyle(el, { strokeWidth: 4, dash: 0, strokeColor: '#dc2626' });
  assert.equal(visProp.strokewidth, 4);
  assert.equal(visProp.dash, 0);
  assert.equal(visProp.strokecolor, '#dc2626');
});

test('dashed style enables dashScale so thick lines stay dashed', async () => {
  const { applyObjectStyle } = await load('apps/web/src/math/shared/object-style.js');

  /** @type {Record<string, unknown>} */
  const visProp = {
    strokecolor: '#b45309',
    strokewidth: 2,
    dash: 2,
    dashscale: false,
  };
  let lastDashCall = null;
  const el = {
    elType: 'line',
    name: 'L',
    visProp,
    setAttribute(attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        visProp[k.toLowerCase()] = v;
      }
    },
    getAttribute(key) {
      return visProp[key.toLowerCase()];
    },
    board: {
      renderer: {
        setDashStyle(target) {
          lastDashCall = target;
        },
      },
      update() {},
    },
  };

  applyObjectStyle(el, { dash: 2, strokeWidth: 6 });
  assert.equal(visProp.dash, 2);
  assert.equal(visProp.strokewidth, 6);
  assert.equal(visProp.dashscale, true);
  assert.equal(lastDashCall, el);

  // 仅加粗时，已有虚线也应打开 dashScale
  visProp.dashscale = false;
  applyObjectStyle(el, { strokeWidth: 5 });
  assert.equal(visProp.dashscale, true);
});

test('jsx labs wire object-style bubble (double-click)', () => {
  for (const rel of [
    'apps/web/src/math/graph/index.js',
    'apps/web/src/math/plane/index.js',
    'apps/web/src/math/trig/index.js',
    'apps/web/src/math/sequence/index.js',
  ]) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.match(src, /bindObjectStyleForPanel/, rel);
    assert.match(src, /createBoardSelectionController/, rel);
  }
  const panel = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/object-style-panel.js'),
    'utf8',
  );
  const select = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/object-select.js'),
    'utf8',
  );
  assert.match(panel, /mathObjectStyleBubble/);
  assert.match(panel, /brand-tip-bubble/);
  assert.match(panel, /getObjectStyleBubble/);
  assert.match(panel, /bindOutside/);
  assert.match(panel, /pointerdown.*true|addEventListener\('pointerdown'/);
  assert.match(panel, /requestAnimationFrame/);
  assert.match(panel, /setActiveSelection/);
  assert.match(panel, /bubbleApi/);
  assert.match(panel, /点气泡外关闭|bubble\?\.contains|root\.contains/);
  assert.match(select, /dblclick/);
  assert.match(select, /hasPoint/);
  assert.match(select, /getMousePosition/);
  assert.doesNotMatch(select, /host\.addEventListener\('pointerdown'/);
  assert.doesNotMatch(panel, /side-drawer-body/);
});

test('object style bubble module uses singleton pattern', () => {
  const panel = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/object-style-panel.js'),
    'utf8',
  );
  assert.match(panel, /let bubbleApi = null/);
  assert.match(panel, /if \(!bubbleApi\) bubbleApi = buildBubbleApi\(\)/);
  assert.match(panel, /不 dispose 单例 panel|\/\/ 不 dispose 单例/);
  assert.match(panel, /export function dismissObjectStyleBubble/);
});

test('math classroom dismisses object style bubble on tab switch and leave', () => {
  const src = fs.readFileSync(
    path.join(root, 'apps/web/src/subjects/classrooms/math-classroom.js'),
    'utf8',
  );
  assert.match(src, /dismissObjectStyleBubble/);
  assert.match(src, /dismissMathOverlays/);
  assert.match(src, /deactivateTab\(\)\s*\{[\s\S]*dismissMathOverlays/);
  assert.match(src, /leave\(\)\s*\{[\s\S]*dismissMathOverlays/);
});
