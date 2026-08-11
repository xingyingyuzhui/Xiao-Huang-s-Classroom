/**
 * app-dialog 与 @xiaohuang/ui .ui-dialog 皮肤不得叠层：
 * 根节点必须复位 transform/卡片底，否则加点跟随确认会裁切到视口角落并露出大灰块。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const css = fs.readFileSync(
  path.join(root, 'apps/web/src/shared/styles/_app-dialog.css'),
  'utf8',
);
const indexCss = fs.readFileSync(path.join(root, 'apps/web/src/shared/styles/index.css'), 'utf8');
const uiKit = fs.readFileSync(path.join(root, 'apps/web/src/shared/styles/_ui-kit.css'), 'utf8');

test('app-dialog.css 在 ui-kit 之后加载（保证覆盖 .ui-dialog）', () => {
  const ui = indexCss.indexOf("_ui-kit.css'");
  const app = indexCss.indexOf("_app-dialog.css'");
  assert.ok(ui >= 0 && app >= 0, 'index.css 须同时导入 ui-kit 与 app-dialog');
  assert.ok(app > ui, 'app-dialog 必须排在 ui-kit 之后');
});

test('app-dialog-root.ui-dialog 复位卡片皮肤与 transform', () => {
  assert.match(css, /\.app-dialog-root\.ui-dialog/);
  assert.match(css, /transform:\s*none/);
  assert.match(css, /background:\s*transparent/);
  assert.match(css, /\.app-dialog-root\.ui-dialog::before/);
  assert.match(css, /content:\s*none/);
});

test('ui-kit 提供 ui-dialog--shell 宿主模式（与卡片皮肤隔离）', () => {
  assert.match(uiKit, /\.ui-dialog\.ui-dialog--shell\s*\{/);
  assert.match(uiKit, /\.ui-dialog\.ui-dialog--shell\s*\{[^}]*transform:\s*none/s);
  assert.match(uiKit, /\.ui-dialog\.ui-dialog--shell::before\s*\{[^}]*content:\s*none/s);
});

test('生产面 createDialog 仅允许经 app-dialog 装配（dev catalog 除外）', () => {
  const webSrc = path.join(root, 'apps/web/src');
  /** @type {string[]} */
  const offenders = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'dev') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile() || !/\.(js|ts)$/.test(entry.name)) continue;
      const rel = path.relative(webSrc, full).split(path.sep).join('/');
      if (rel === 'shared/ui/app-dialog.js') continue;
      const source = fs.readFileSync(full, 'utf8');
      const importsUi = /from\s+['"]@xiaohuang\/ui['"]/.test(source);
      if (importsUi && /\bcreateDialog\b/.test(source)) offenders.push(rel);
    }
  }
  walk(webSrc);
  assert.deepEqual(
    offenders,
    [],
    `生产面禁止直调 createDialog（会叠 .ui-dialog 卡片皮肤），请走 appConfirm/appAlert。命中: ${offenders.join(', ')}`,
  );
});

test('app-dialog.js 挂上 ui-dialog--shell', () => {
  const js = fs.readFileSync(path.join(root, 'apps/web/src/shared/ui/app-dialog.js'), 'utf8');
  assert.match(js, /ui-dialog--shell/);
  assert.match(js, /createDialog\(/);
});

test('app-dialog 仍用自管 backdrop + modal-panel 居中层', () => {
  assert.match(css, /\.app-dialog-backdrop\s*\{/);
  assert.match(css, /\.app-dialog-panel\.modal-panel\s*\{/);
  assert.match(css, /\.app-dialog-root\s*\{[^}]*inset:\s*0/s);
});
