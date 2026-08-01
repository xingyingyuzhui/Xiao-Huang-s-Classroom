/** 函数列表视图：事件委托、菜单键盘、连续 render 幂等与 dispose。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function listViewModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/function-list-view.js')).href,
  );
}

function fn(id, overrides = {}) {
  return {
    id,
    name: '',
    kind: 'preset',
    preset: 'quadratic',
    expr: '',
    coeffs: { a: 1, b: 0, c: 0 },
    color: '#111',
    visible: true,
    locked: false,
    domain: { mode: 'viewport' },
    ...overrides,
  };
}

/** 极简 DOM：正则驱动的可查询 fake root（node 无 DOMParser） */

/** 从 html 中定位包含某 data 属性的标签，提取该标签的全部 data 属性 */
function attrsFromTagAround(html, key, value) {
  const marker = `data-${key}="${value}"`;
  const idx = html.lastIndexOf(marker);
  if (idx < 0) return {};
  const open = html.lastIndexOf('<', idx);
  const close = html.indexOf('>', idx);
  const tag = html.slice(open, close < 0 ? html.length : close + 1);
  const out = {};
  const re = /data-([\w-]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(tag))) out[`data-${m[1]}`] = m[2];
  return out;
}

function makeElement(html, selector) {
  // 元素身份：选择器指定 + 所在标签的完整 data 属性
  const attrs = {};
  const selRe = /data-([\w-]+)="([^"]*)"/g;
  let first = null;
  let sm;
  while ((sm = selRe.exec(selector))) {
    attrs[`data-${sm[1]}`] = sm[2];
    if (!first) first = sm;
  }
  if (first) Object.assign(attrs, attrsFromTagAround(html, first[1], first[2]));
  return {
    tagName: 'BUTTON',
    attrs,
    getAttribute(name) {
      return attrs[name] ?? null;
    },
    closest(sel) {
      const valueMatch = /data-([\w-]+)="([^"]*)"/.exec(sel);
      if (valueMatch) {
        return attrs[`data-${valueMatch[1]}`] === valueMatch[2] ? this : null;
      }
      // 属性存在选择器（如 [data-fn-id]）
      const presenceMatch = /^\[data-([\w-]+)\]$/.exec(sel);
      if (presenceMatch) {
        return attrs[`data-${presenceMatch[1]}`] != null ? this : null;
      }
      const classMatch = /^\.([\w-]+)$/.exec(sel);
      if (classMatch) {
        return html.includes(classMatch[1]) ? this : null;
      }
      return null;
    },
    outerHTML: html,
  };
}

function makeRoot() {
  const root = {
    _html: '',
    listeners: {},
    get innerHTML() {
      return this._html;
    },
    set innerHTML(value) {
      this._html = value;
    },
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
    removeEventListener(type) {
      delete this.listeners[type];
    },
    querySelector(selector) {
      const m = /^\[data-([\w-]+)="([^"]*)"\]$/.exec(selector);
      if (m) {
        const re = new RegExp(`data-${m[1]}="${m[2]}"`);
        return re.test(this._html) ? makeElement(this._html, selector) : null;
      }
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        return this._html.includes(cls) ? makeElement(this._html, selector) : null;
      }
      return null;
    },
    querySelectorAll(selector) {
      const m = /^\[data-([\w-]+)="([^"]*)"\]$/.exec(selector);
      if (m) {
        const re = new RegExp(`data-${m[1]}="${m[2]}"`, 'g');
        return [...this._html.matchAll(re)].map(() => makeElement(this._html, selector));
      }
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        // 卡片 div 的 class 以 math-fn-card 开头（math-fn-card-toggle 等子元素不算）
        const re = new RegExp(`class="${cls}(?:\\s|")`, 'g');
        return [...this._html.matchAll(re)].map(() => makeElement(this._html, selector));
      }
      return [];
    },
    click(selector) {
      const el = this.querySelector(selector);
      if (!el) throw new Error(`no element for ${selector}`);
      this.listeners.click({ target: el, preventDefault() {}, stopPropagation() {} });
    },
    keydown(selector, event) {
      const el = this.querySelector(selector);
      if (!el) throw new Error(`no element for ${selector}`);
      this.listeners.keydown({ ...event, target: el, preventDefault() {} });
    },
  };
  return root;
}

test('render emits cards with visibility toggle and menu', async () => {
  const { createFunctionListView } = await listViewModule();
  const root = makeRoot();
  const listView = createFunctionListView({ root });
  listView.render([fn('f1', { name: '二次' }), fn('f2', { visible: false })], 'f1', false);
  assert.equal(root.querySelectorAll('.math-fn-card').length, 2);
  assert.ok(root.querySelector('[data-fn-toggle="f1"]'));
  assert.ok(root.querySelector('[data-fn-menu="f1"]'));
  // 隐藏态提示（不只靠颜色）：html 层断言
  assert.match(root.innerHTML, /is-hidden/);
  assert.match(root.innerHTML, /已隐藏/);
});

test('click delegation fires select, toggle and menu actions once per click', async () => {
  const { createFunctionListView } = await listViewModule();
  const root = makeRoot();
  const calls = [];
  const listView = createFunctionListView({
    root,
    callbacks: {
      onSelect: (id) => calls.push(['select', id]),
      onToggleVisible: (id) => calls.push(['toggle', id]),
      onMenu: (id, action) => calls.push(['menu', id, action]),
    },
  });
  const functions = [fn('f1'), fn('f2'), fn('f3')];
  // 连续 render 20 次后事件仍只委托一次
  for (let i = 0; i < 20; i += 1) listView.render(functions, 'f1');
  root.click('[data-fn-id="f2"]');
  assert.deepEqual(calls, [['select', 'f2']], 'one click must fire exactly one callback');

  root.click('[data-fn-toggle="f1"]');
  assert.deepEqual(calls[1], ['toggle', 'f1']);

  // 打开菜单 → 菜单项动作
  root.click('[data-fn-menu="f1"]');
  root.click('[data-fn-action="duplicate"]');
  assert.deepEqual(calls[2], ['menu', 'f1', 'duplicate']);
});

test('menu opens with Enter/Space and closes with Escape', async () => {
  const { createFunctionListView } = await listViewModule();
  const root = makeRoot();
  const listView = createFunctionListView({ root });
  listView.render([fn('f1')], 'f1');
  assert.equal(root.querySelector('[data-fn-menu-panel="f1"]'), null);
  root.keydown('[data-fn-menu="f1"]', { key: 'Enter' });
  assert.ok(root.querySelector('[data-fn-menu-panel="f1"]'), 'Enter opens the menu');
  root.keydown('[data-fn-menu="f1"]', { key: ' ' });
  assert.equal(root.querySelector('[data-fn-menu-panel="f1"]'), null, 'Space toggles closed');
  root.keydown('[data-fn-menu="f1"]', { key: 'Enter' });
  root.keydown('[data-fn-id="f1"]', { key: 'Escape' });
  assert.equal(root.querySelector('[data-fn-menu-panel="f1"]'), null, 'Escape closes the menu');
});

test('dispose removes listeners', async () => {
  const { createFunctionListView } = await listViewModule();
  const root = makeRoot();
  const calls = [];
  const listView = createFunctionListView({
    root,
    callbacks: { onSelect: (id) => calls.push(id) },
  });
  listView.render([fn('f1')], 'f1');
  listView.dispose();
  assert.equal(root.listeners.click, undefined);
  assert.equal(root.listeners.keydown, undefined);
});
