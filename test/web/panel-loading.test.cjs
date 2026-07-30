/**
 * 按需加载占位层回归：
 * 1) CSS 契约：display:flex 必须被 [hidden] 的 none !important 盖住
 * 2) 占位不得用 grid 铺行（须 absolute，避免挤出真实内容）
 * 3) DOM 助手 show/hide/error 行为
 * 4) main 集成：使用 panel-loading 模块 + switchSeq 成功后会 hide
 */
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = require('../helpers/repo-root.js');

function source(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

/** 极简 panel mock，足够跑 panel-loading 助手 */
function createMockPanel() {
  /** @type {any[]} */
  const nodes = [];
  const doc = {
    createElement(tag) {
      const el = {
        tagName: String(tag).toUpperCase(),
        className: '',
        textContent: '',
        hidden: false,
        attrs: Object.create(null),
        setAttribute(k, v) {
          this.attrs[k] = v == null ? '' : String(v);
        },
        getAttribute(k) {
          return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
        },
        hasAttribute(k) {
          return Object.prototype.hasOwnProperty.call(this.attrs, k);
        },
      };
      return el;
    },
  };
  const panel = {
    ownerDocument: doc,
    querySelector(sel) {
      if (sel === '[data-panel-loading]') {
        return nodes.find((n) => n.hasAttribute('data-panel-loading')) || null;
      }
      return null;
    },
    prepend(el) {
      nodes.unshift(el);
    },
    get _nodes() {
      return nodes;
    },
  };
  return panel;
}

test('layout CSS: panel-loading is absolute overlay (does not steal grid rows)', () => {
  const css = source('apps/web/src/shared/styles/_layout.css');
  // 取出 .panel-loading { ... } 主体（不含 [hidden] 规则）
  const block = css.match(/\.panel-loading\s*\{([^}]+)\}/);
  assert.ok(block, '.panel-loading rule must exist');
  const body = block[1];
  assert.match(body, /position\s*:\s*absolute/i, 'must be absolute so it does not create a grid row');
  assert.match(body, /inset\s*:\s*0|top\s*:\s*0/i, 'should cover panel');
  assert.doesNotMatch(body, /grid-column\s*:/, 'must not use grid-column (regressed layout squeeze)');
  assert.doesNotMatch(body, /grid-row\s*:/, 'must not use grid-row (regressed layout squeeze)');
});

test('layout CSS: panel-loading[hidden] forces display none !important', () => {
  const css = source('apps/web/src/shared/styles/_layout.css');
  // 作者 display:flex 会压过 UA [hidden]；必须有配套规则
  assert.match(
    css,
    /\.panel-loading\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/i,
    'hidden loading must force display:none !important',
  );
  // 可见态允许 flex 居中
  const visible = css.match(/\.panel-loading\s*\{([^}]+)\}/);
  assert.ok(visible);
  assert.match(visible[1], /display\s*:\s*flex/i);
});

test('layout CSS is imported into styles entry', () => {
  const index = source('apps/web/src/shared/styles/index.css');
  assert.match(index, /@import\s+['"]\.\/_layout\.css['"]/);
});

test('panel-loading helpers: show then hide sets hidden and keeps one node', async () => {
  const {
    showPanelLoading,
    hidePanelLoading,
    PANEL_LOADING_CLASS,
    PANEL_LOADING_ATTR,
  } = await import('../../apps/web/src/app/panel-loading.js');

  const panel = createMockPanel();
  const a = showPanelLoading(panel);
  assert.ok(a);
  assert.equal(a.hidden, false);
  assert.equal(a.className, PANEL_LOADING_CLASS);
  assert.equal(a.getAttribute(PANEL_LOADING_ATTR), '');
  assert.match(a.textContent, /加载中/);
  assert.equal(panel._nodes.length, 1);

  showPanelLoading(panel); // 再次 show 不重复插入
  assert.equal(panel._nodes.length, 1);

  hidePanelLoading(panel);
  assert.equal(a.hidden, true, 'hide must set hidden=true for CSS [hidden] rule');
  assert.equal(panel._nodes.length, 1, 'node stays for reuse');
});

test('panel-loading helpers: error shows message; hide after error keeps failure text until next show', async () => {
  const { showPanelLoading, hidePanelLoading, showPanelError } = await import(
    '../../apps/web/src/app/panel-loading.js'
  );
  const panel = createMockPanel();
  showPanelError(panel, '网络错误');
  const el = panel.querySelector('[data-panel-loading]');
  assert.ok(el);
  assert.equal(el.hidden, false);
  assert.match(el.textContent, /加载失败：网络错误/);

  hidePanelLoading(panel);
  assert.equal(el.hidden, true);
  // 错误文案在 hide 时保留（便于调试）；再次 show 会改回加载中
  assert.match(el.textContent, /加载失败/);

  showPanelLoading(panel);
  assert.equal(el.hidden, false);
  assert.equal(el.textContent, '加载中…');
});

test('panel-loading helpers: null panel is no-op', async () => {
  const { showPanelLoading, hidePanelLoading, showPanelError } = await import(
    '../../apps/web/src/app/panel-loading.js'
  );
  assert.equal(showPanelLoading(null), null);
  assert.doesNotThrow(() => hidePanelLoading(null));
  assert.equal(showPanelError(undefined, 'x'), null);
});

test('chemistry classroom wires panel-loading and always hides after successful load', () => {
  const main = source('apps/web/src/subjects/classrooms/tabbed-classroom.js');
  assert.match(main, /panel-loading\.js/);
  assert.match(main, /showPanelLoading/);
  assert.match(main, /hidePanelLoading/);
  assert.match(main, /showPanelError/);
  const runFeature = main.match(/async function runFeatureLoad[\s\S]*?(?=\n  async function|\n  function)/);
  assert.ok(runFeature, 'runFeatureLoad must exist');
  const body = runFeature[0];
  const hideCount = (body.match(/hidePanelLoading/g) || []).length;
  assert.ok(hideCount >= 3, `runFeatureLoad should call hide on success/stale/stale-error (got ${hideCount})`);
  assert.doesNotMatch(main, /loader\.isStale/);
  assert.match(main, /mySeq\s*!==\s*switchSeq/);
});

test('chemistry classroom lazy features go through runFeatureLoad (loading lifecycle)', () => {
  const main = source('apps/web/src/subjects/classrooms/chemistry-classroom.js');
  const tabbed = source('apps/web/src/subjects/classrooms/tabbed-classroom.js');
  assert.match(tabbed, /async function runFeatureLoad/);
  for (const name of ['molecule', 'electron', 'ai', 'battle']) {
    assert.match(
      main,
      new RegExp(`runFeatureLoad\\(\\s*['"]${name === 'ai' ? 'ai' : name}['"]`),
      `${name} tab should use runFeatureLoad`,
    );
  }
});

test('settings drawer splits hub vs lab sections', () => {
  const html = fs.readFileSync(path.join(root, 'apps/web/index.html'), 'utf8');
  assert.match(html, /id="settingsDefaultPageBlock"/);
  assert.match(html, /id="settingsAiSection"/);
  const settings = fs.readFileSync(
    path.join(root, 'apps/web/src/shared/ui/settings.js'),
    'utf8',
  );
  assert.match(settings, /setContext/);
  assert.match(settings, /syncSettingsSections/);
  assert.match(settings, /subjectSettings/);
  assert.match(settings, /applyHubBrand/);
  assert.match(settings, /applySubjectBrand/);
});

test('tabbed classroom factory exists for multi-tab subjects', () => {
  assert.ok(
    fs.existsSync(path.join(root, 'apps/web/src/subjects/classrooms/tabbed-classroom.js')),
  );
  const tabbed = fs.readFileSync(
    path.join(root, 'apps/web/src/subjects/classrooms/tabbed-classroom.js'),
    'utf8',
  );
  assert.match(tabbed, /export function createTabbedClassroom/);
  assert.match(tabbed, /defaultPageOptions/);
});

/**
 * 模拟「CSS 若缺少 [hidden] 规则」会怎样被契约拦住
 * （用错误 CSS 样例断言我们的检查逻辑仍有效）
 */
test('CSS contract detector rejects flex-only loading without hidden override', () => {
  const bad = `
.panel-loading {
  display: flex;
  grid-column: 1 / -1;
  grid-row: 1 / -1;
}
`;
  const hasHiddenOverride = /\.panel-loading\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/i.test(bad);
  const usesGridSteal = /\.panel-loading\s*\{[^}]*grid-column/i.test(bad);
  assert.equal(hasHiddenOverride, false);
  assert.equal(usesGridSteal, true);

  const good = source('apps/web/src/shared/styles/_layout.css');
  assert.equal(
    /\.panel-loading\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/i.test(good),
    true,
  );
  assert.equal(
    /\.panel-loading\s*\{[^}]*grid-column/i.test(good),
    false,
  );
});
