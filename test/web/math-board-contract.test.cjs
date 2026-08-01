/**
 * 数学画板工程契约：主题 token + 生命周期模块 + graph 接线
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const THEMES = ['default', 'stationery', 'reagent', 'pixel', 'blackboard'];
const REQUIRED = [
  '--math-fn-1',
  '--math-fn-2',
  '--math-fn-3',
  '--math-fn-4',
  '--math-fn-5',
  '--math-fn-6',
  '--math-fn-7',
  '--math-fn-8',
  '--math-grid',
  '--math-point-ring',
];

test('all themes declare required math board tokens', () => {
  for (const theme of THEMES) {
    const file = path.join(
      root,
      'apps/web/src/shared/styles/themes',
      theme,
      'tokens.css',
    );
    const css = fs.readFileSync(file, 'utf8');
    for (const token of REQUIRED) {
      assert.match(
        css,
        new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `${theme} tokens.css missing ${token}`,
      );
    }
    // 网格禁止写成 border-soft 别名（过浅）
    assert.doesNotMatch(
      css,
      /--math-grid:\s*var\(--border-soft\)/,
      `${theme}: --math-grid must not be border-soft`,
    );
  }
});

test('math-theme module is the palette contract', () => {
  const src = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/math-theme.js'),
    'utf8',
  );
  assert.match(src, /REQUIRED_MATH_THEME_TOKENS/);
  assert.match(src, /export function getMathFnPalette/);
  assert.match(src, /export function getMathGridColor/);
  assert.match(src, /export function getMathBoardChrome/);
  assert.match(src, /export function remintFunctionColors/);
  assert.match(src, /export function colorForFnIndex/);
  assert.match(src, /--math-fn-/);
});

test('board-lifecycle exports viewport + detach + theme bind', () => {
  const src = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/board-lifecycle.js'),
    'utf8',
  );
  assert.match(src, /export function withPreservedViewport/);
  assert.match(src, /export function detachBoardObject/);
  assert.match(src, /export function bindMathThemeRestyle/);
  assert.match(src, /chem-theme-change/);
  assert.match(src, /restyleMathBoard/);
});

test('jsx-board restyle uses math-theme not border-soft for grid', () => {
  const src = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/jsx-board.js'),
    'utf8',
  );
  assert.match(src, /getMathBoardChrome|getMathGridColor/);
  assert.match(src, /applyMathGridColor/);
  assert.match(src, /export function restyleMathBoard/);
  assert.doesNotMatch(src, /border-soft.*grid|grid.*border-soft/);
});

test('jsx-board wheel zoom is gentle; nav +/- keep a larger step', () => {
  const src = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/jsx-board.js'),
    'utf8',
  );
  assert.match(src, /MATH_WHEEL_ZOOM_FACTOR\s*=\s*1\.015/);
  assert.match(src, /MATH_NAV_ZOOM_FACTOR\s*=\s*1\.2/);
  assert.match(src, /factorX:\s*MATH_WHEEL_ZOOM_FACTOR/);
  assert.match(src, /zoomFromNavButton/);
  assert.match(src, /rebindNavButton/);
});

test('graph follows lifecycle contract', () => {
  const src = fs.readFileSync(path.join(root, 'apps/web/src/math/graph/index.js'), 'utf8');
  assert.match(src, /withPreservedViewport/);
  assert.match(src, /detachBoardObject|detachFnCurve/);
  assert.match(src, /bindMathThemeRestyle/);
  assert.match(src, /remintFunctionColors|remintFnColorsForTheme/);
  assert.match(src, /colorForFnIndex|getMathBoardChrome/);
  // 删除：先 detach 再 filter
  assert.match(src, /detachFnCurve\(rec\)[\s\S]*filter/);
});

test('graph board tools v1 strip and construction lifecycle are wired', () => {
  const tools = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/board-tools.js'),
    'utf8',
  );
  const draw = fs.readFileSync(
    path.join(root, 'apps/web/src/math/graph/draw-tools.js'),
    'utf8',
  );
  const graph = fs.readFileSync(path.join(root, 'apps/web/src/math/graph/index.js'), 'utf8');
  const css = fs.readFileSync(
    path.join(root, 'apps/web/src/shared/styles/_math-classroom.css'),
    'utf8',
  );

  for (const id of [
    'select',
    'point',
    'segment',
    'line',
    'tangent',
    'perp-axis',
    'intersect',
    'delete',
  ]) {
    assert.match(tools, new RegExp(`id:\\s*'${id}'`));
  }
  assert.match(tools, /export function attachBoardToolStrip/);
  assert.match(tools, /export function attachToolPointer/);
  assert.match(draw, /export function createTangent/);
  assert.match(draw, /export function createPerpToAxis/);
  assert.match(draw, /长 \$\{|segmentLengthText|formatSmartNumber/);
  assert.match(graph, /board-label|formatNamedCoords|BOARD_LABEL_FONT_SIZE/);
  assert.match(draw, /export function snapshotConstructions/);
  assert.match(draw, /export function restoreConstructions/);
  assert.match(graph, /attachBoardToolStrip/);
  assert.match(graph, /snapshotConstructions/);
  assert.match(graph, /restoreConstructions/);
  assert.match(graph, /handleToolTap/);
  assert.match(tools, /math-board-tool-label/);
  assert.match(css, /\.math-board-tool-label/);
  assert.doesNotMatch(tools, /math-board-tool-icon/);
});

test('other jsx labs bind theme restyle', () => {
  for (const lab of ['plane', 'trig', 'sequence']) {
    const src = fs.readFileSync(
      path.join(root, `apps/web/src/math/${lab}/index.js`),
      'utf8',
    );
    assert.match(src, /bindMathThemeRestyle/, `${lab} missing theme bind`);
  }
});

test('math AGENTS.md documents the contract', () => {
  const md = fs.readFileSync(path.join(root, 'apps/web/src/math/AGENTS.md'), 'utf8');
  assert.match(md, /主题契约/);
  assert.match(md, /withPreservedViewport|视窗/);
  assert.match(md, /detach|幽灵/);
  assert.match(md, /math-theme/);
  assert.match(md, /chem-theme-change|换肤/);
  assert.match(md, /@xiaohuang\/math-expr|math-expr/);
});

test('math-expr package is dual-published and wired', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'packages/math-expr/package.json'), 'utf8'),
  );
  assert.equal(pkg.name, '@xiaohuang/math-expr');
  const webPkg = JSON.parse(
    fs.readFileSync(path.join(root, 'apps/web/package.json'), 'utf8'),
  );
  const serverPkg = JSON.parse(
    fs.readFileSync(path.join(root, 'apps/server/package.json'), 'utf8'),
  );
  assert.ok(webPkg.dependencies['@xiaohuang/math-expr']);
  assert.ok(serverPkg.dependencies['@xiaohuang/math-expr']);
  const webShim = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/expr-safe.js'),
    'utf8',
  );
  assert.match(webShim, /@xiaohuang\/math-expr/);
  const svc = fs.readFileSync(
    path.join(root, 'apps/server/src/services/ai/math-fn-service.js'),
    'utf8',
  );
  assert.match(svc, /@xiaohuang\/math-expr/);
  assert.doesNotMatch(svc, /const FN_NAMES = \['sin'/);
});
