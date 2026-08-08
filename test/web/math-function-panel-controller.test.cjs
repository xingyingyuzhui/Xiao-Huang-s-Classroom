/** 函数列表视图：安全 DOM 渲染、事件委托、菜单键盘、连续 render 幂等与 dispose。 */
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
    colorSlot: 0,
    explicitColor: null,
    visible: true,
    locked: false,
    domain: { mode: 'viewport' },
    ...overrides,
  };
}

/** 极简 fake DOM：节点树 + 序列化 HTML + 正则查询（node 无真实 DOM）。 */

function makeFakeElement(tag, owner) {
  const node = {
    tagName: tag.toUpperCase(),
    className: '',
    attrs: {},
    dataset: {},
    children: [],
    style: {
      values: {},
      setProperty(name, value) {
        node.style.values[name] = value;
      },
    },
    classList: {
      add(...names) {
        const set = new Set(node.className.split(/\s+/).filter(Boolean));
        names.forEach((n) => set.add(n));
        node.className = [...set].join(' ');
      },
      remove(...names) {
        const set = new Set(node.className.split(/\s+/).filter(Boolean));
        names.forEach((n) => set.delete(n));
        node.className = [...set].join(' ');
      },
      toggle(name, force) {
        const set = new Set(node.className.split(/\s+/).filter(Boolean));
        if (force === undefined) {
          if (set.has(name)) {
            set.delete(name);
            node.className = [...set].join(' ');
            return false;
          }
          set.add(name);
          node.className = [...set].join(' ');
          return true;
        }
        if (force) set.add(name);
        else set.delete(name);
        node.className = [...set].join(' ');
        return force;
      },
      contains(name) {
        return node.className.split(/\s+/).includes(name);
      },
    },
    textContent: '',
    type: '',
    title: '',
    hidden: false,
    parent: null,
    appendChild(child) {
      child.parent = node;
      node.children.push(child);
      return child;
    },
    append(...nodes) {
      for (const n of nodes) {
        if (typeof n === 'string') node.textContent += n;
        else {
          n.parent = node;
          node.children.push(n);
        }
      }
    },
    remove() {
      if (!node.parent) return;
      const index = node.parent.children.indexOf(node);
      if (index >= 0) node.parent.children.splice(index, 1);
      node.parent = null;
    },
    addEventListener(type, fn) {
      node.listeners = node.listeners || {};
      (node.listeners[type] = node.listeners[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      node.listeners = node.listeners || {};
      node.listeners[type] = (node.listeners[type] || []).filter((f) => f !== fn);
    },
    setAttribute(name, value) {
      node.attrs[name] = String(value);
    },
    removeAttribute(name) {
      delete node.attrs[name];
    },
    getAttribute(name) {
      if (name.startsWith('data-')) {
        const key = camel(name.slice(5));
        if (node.dataset[key] != null) return node.dataset[key];
      }
      return node.attrs[name] ?? null;
    },
    closest(sel) {
      return owner.closestOn(node, sel);
    },
    outerHTML: '',
  };
  return node;
}

/** 把 fake 节点树序列化为 HTML（供正则查询与注入断言）。 */
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function serialize(node) {
  const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  if (typeof node === 'string') return escape(node);
  const attrParts = [];
  for (const [key, value] of Object.entries(node.dataset)) {
    attrParts.push(`data-${kebab(key)}="${escape(value)}"`);
  }
  for (const [key, value] of Object.entries(node.attrs)) {
    if (value !== null) attrParts.push(`${key}="${escape(value)}"`);
  }
  const styleKeys = Object.keys(node.style.values);
  if (styleKeys.length) {
    const styleText = styleKeys
      .map((k) => `${k}:${node.style.values[k]}`)
      .join(';');
    attrParts.push(`style="${styleText}"`);
  }
  const classAttr = node.className ? ` class="${node.className}"` : '';
  const attrs = attrParts.length ? ` ${attrParts.join(' ')}` : '';
  const inner = node.children.map(serialize).join('') + escape(node.textContent);
  return `<${node.tagName.toLowerCase()}${classAttr}${attrs}>${inner}</${node.tagName.toLowerCase()}>`;
}

function makeRoot() {
  const root = {
    _nodes: [],
    _html: '',
    listeners: {},
    get innerHTML() {
      return this._html;
    },
    set innerHTML(value) {
      this._html = value;
      this._nodes = value ? [{ tagName: 'DIV', className: '', attrs: {}, dataset: {}, children: [], style: { values: {} }, classList: { add() {} }, textContent: '', appendChild() {}, append() {}, setAttribute() {}, getAttribute: () => null, closest: () => null }] : [];
    },
    replaceChildren(...nodes) {
      this._nodes = nodes.filter(Boolean);
      this._html = this._nodes.map(serialize).join('');
    },
    appendChild(node) {
      this._nodes.push(node);
      this._html = this._nodes.map(serialize).join('');
    },
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
    removeEventListener(type) {
      delete this.listeners[type];
    },
    closestOn(node, selector) {
      const matches = (n) => {
        const valueMatch = /data-([\w-]+)="([^"]*)"/.exec(selector);
        if (valueMatch) {
          return n.dataset?.[camel(valueMatch[1])] === valueMatch[2];
        }
        const presenceMatch = /^\[data-([\w-]+)\]$/.exec(selector);
        if (presenceMatch) {
          return n.dataset?.[camel(presenceMatch[1])] != null;
        }
        const classMatch = /^\.([\w-]+)$/.exec(selector);
        if (classMatch) {
          return (n.className || '').split(/\s+/).includes(classMatch[1]);
        }
        return false;
      };
      let cur = node;
      while (cur) {
        if (matches(cur)) return cur;
        cur = cur.parent || null;
      }
      return null;
    },
    querySelector(selector) {
      const found = this.querySelectorAll(selector);
      return found.length ? found[0] : null;
    },
    querySelectorAll(selector) {
      const out = [];
      const walk = (node) => {
        const valueMatch = /data-([\w-]+)="([^"]*)"/.exec(selector);
        const classMatch = /^\.([\w-]+)$/.exec(selector);
        const presenceMatch = /^\[data-([\w-]+)\]$/.exec(selector);
        let hit = false;
        if (valueMatch) {
          hit = node.dataset?.[camel(valueMatch[1])] === valueMatch[2];
        } else if (presenceMatch) {
          hit = node.dataset?.[camel(presenceMatch[1])] != null;
        } else if (classMatch) {
          hit = (node.className || '').split(/\s+/).includes(classMatch[1]);
        }
        if (hit) out.push(node);
        for (const c of node.children || []) walk(c);
      };
      for (const n of this._nodes) walk(n);
      return out;
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

/** fake document：只提供 createElement（渲染层用它构建卡片）。 */
function installFakeDocument() {
  const elements = [];
  const doc = {
    createElement(tag) {
      const el = makeFakeElement(tag, rootRef.root);
      elements.push(el);
      return el;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  return doc;
}

let rootRef = { root: null };

test('render emits cards with visibility toggle and menu', async () => {
  const { createFunctionListView } = await listViewModule();
  const prevDoc = globalThis.document;
  globalThis.document = installFakeDocument();
  try {
    const root = makeRoot();
    rootRef.root = root;
    const listView = createFunctionListView({ root });
    listView.render([fn('f1', { name: '二次' }), fn('f2', { visible: false })], 'f1', false);
    assert.equal(root.querySelectorAll('.math-fn-card').length, 2);
    assert.ok(root.querySelector('[data-fn-toggle="f1"]'));
    assert.ok(root.querySelector('[data-fn-menu="f1"]'));
    assert.match(root.innerHTML, /is-hidden/);
    assert.doesNotMatch(root.innerHTML, /已隐藏/);
  } finally {
    globalThis.document = prevDoc;
  }
});

test('malicious names and colors never reach attributes or inline styles', async () => {
  const { createFunctionListView } = await listViewModule();
  const prevDoc = globalThis.document;
  globalThis.document = installFakeDocument();
  try {
    const root = makeRoot();
    rootRef.root = root;
    const listView = createFunctionListView({ root });
    const maliciousName = 'x" autofocus onfocus="globalThis.__xss=1';
    const maliciousColor = 'red;background:url(https://example.invalid/x)';
    const evil = fn('f1', {
      name: maliciousName,
      colorSlot: 0,
      explicitColor: maliciousColor,
    });
    listView.render([evil], 'f1');
    // 注入向量：未转义的属性断点 / 属性形态的 autofocus（转义后的 &quot; 是安全文本）
    assert.doesNotMatch(root.innerHTML, / onfocus="[^&]/, 'no attribute injection');
    assert.doesNotMatch(root.innerHTML, /autofocus\s*=[^&]/, 'no attribute injection');
    assert.doesNotMatch(root.innerHTML, /autofocus"/, 'no attribute injection');
    assert.doesNotMatch(root.innerHTML, /background:/);
    assert.doesNotMatch(root.innerHTML, /url\(/);
    assert.doesNotMatch(root.innerHTML, /red;/);
    assert.doesNotMatch(root.innerHTML, / style="[^"]*red/, 'color never leaks into style');
    // 恶意名称仍作为可见文本呈现（textContent 赋值）
    assert.ok(root.innerHTML.includes('onfocus'));
    // 颜色解析走严格 hex 校验：恶意值被拒绝 → 落到主题色板 colorSlot
    const card = root.querySelector('.math-fn-card');
    assert.equal(card.style.values['--fn-color'], '#b45309');
  } finally {
    globalThis.document = prevDoc;
  }
});

test('click delegation fires select, toggle and menu actions once per click', async () => {
  const { createFunctionListView } = await listViewModule();
  const prevDoc = globalThis.document;
  globalThis.document = installFakeDocument();
  try {
    const root = makeRoot();
    rootRef.root = root;
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
    for (let i = 0; i < 20; i += 1) listView.render(functions, 'f1');
    root.click('[data-fn-id="f2"]');
    assert.deepEqual(calls, [['select', 'f2']], 'one click must fire exactly one callback');

    root.click('[data-fn-toggle="f1"]');
    assert.deepEqual(calls[1], ['toggle', 'f1']);

    root.click('[data-fn-menu="f1"]');
    root.click('[data-fn-action="duplicate"]');
    assert.deepEqual(calls[2], ['menu', 'f1', 'duplicate']);
  } finally {
    globalThis.document = prevDoc;
  }
});

test('menu opens with Enter/Space and closes with Escape', async () => {
  const { createFunctionListView } = await listViewModule();
  const prevDoc = globalThis.document;
  globalThis.document = installFakeDocument();
  try {
    const root = makeRoot();
    rootRef.root = root;
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
  } finally {
    globalThis.document = prevDoc;
  }
});

test('dispose removes listeners', async () => {
  const { createFunctionListView } = await listViewModule();
  const prevDoc = globalThis.document;
  globalThis.document = installFakeDocument();
  try {
    const root = makeRoot();
    rootRef.root = root;
    const calls = [];
    const listView = createFunctionListView({
      root,
      callbacks: { onSelect: (id) => calls.push(id) },
    });
    listView.render([fn('f1')], 'f1');
    listView.dispose();
    assert.equal(root.listeners.click, undefined);
    assert.equal(root.listeners.keydown, undefined);
  } finally {
    globalThis.document = prevDoc;
  }
});
