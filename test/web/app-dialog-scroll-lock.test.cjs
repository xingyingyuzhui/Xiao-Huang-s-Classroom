/**
 * app-dialog 滚动锁定（P4.3）：打开锁定 document.body 滚动（ui-scroll-lock），
 * 关闭动画结束后释放；覆盖确认/取消/Esc/遮罩各关闭路径、重复关闭幂等、
 * 队列多弹窗引用计数（前一个关闭不提前解锁）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

/** 每次测试独立模块实例（app-dialog 模块内有 queue/busy/引用计数等状态）。 */
let seq = 0;
function dialogModule() {
  seq += 1;
  const url = pathToFileURL(path.join(root, 'apps/web/src/shared/ui/app-dialog.js')).href;
  return import(`${url}?t=${seq}`);
}

/** classList 视图：操作目标的 className（避免在 getter 内 this 别名）。 */
function makeClassList(el) {
  return {
    add(...names) {
      const set = new Set(el.className.split(/\s+/).filter(Boolean));
      for (const n of names) set.add(n);
      el.className = [...set].join(' ');
    },
    remove(...names) {
      const set = new Set(el.className.split(/\s+/).filter(Boolean));
      for (const n of names) set.delete(n);
      el.className = [...set].join(' ');
    },
    toggle(name, force) {
      const set = new Set(el.className.split(/\s+/).filter(Boolean));
      const want = force === undefined ? !set.has(name) : !!force;
      if (want) set.add(name);
      else set.delete(name);
      el.className = [...set].join(' ');
      return want;
    },
    contains(name) {
      return el.className.split(/\s+/).includes(name);
    },
  };
}

/** 极简 fake element：覆盖 app-dialog 与 @xiaohuang/ui createDialog 用到的能力。 */
class FakeHTMLElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.attrs = {};
    this.dataset = {};
    this.children = [];
    this.parent = null;
    this.hidden = false;
    this.textContent = '';
    this.offsetWidth = 0;
    this.value = '';
    this.placeholder = '';
    this.autocomplete = '';
    this.type = '';
    this.listeners = {};
    this.ownerDocument = null;
  }

  get classList() {
    return makeClassList(this);
  }

  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (this.parent) {
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
      this.parent = null;
    }
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attrs[name];
  }

  getAttribute(name) {
    return this.attrs[name] ?? null;
  }

  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }

  removeEventListener(type, fn) {
    const arr = this.listeners[type];
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }

  click() {
    for (const fn of [...(this.listeners.click || [])]) {
      fn({ target: this, preventDefault() {} });
    }
  }

  focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }

  /** body 用：自下而上找祖先，判断节点是否在自身子树内。 */
  contains(child) {
    let cur = child;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parent;
    }
    return false;
  }
}

function installFakeDocument() {
  const doc = {
    elements: [],
    keydownHandlers: [],
    activeElement: null,
  };
  const body = new FakeHTMLElement('body');
  body.ownerDocument = doc;
  doc.body = body;
  doc.createElement = (tag) => {
    const el = new FakeHTMLElement(tag);
    el.ownerDocument = doc;
    doc.elements.push(el);
    return el;
  };
  doc.addEventListener = (type, fn) => {
    if (type === 'keydown') doc.keydownHandlers.push(fn);
  };
  doc.removeEventListener = (type, fn) => {
    if (type === 'keydown') {
      const i = doc.keydownHandlers.indexOf(fn);
      if (i >= 0) doc.keydownHandlers.splice(i, 1);
    }
  };
  return doc;
}

function withFakeDom(fn) {
  return async () => {
    const prevDoc = globalThis.document;
    const prevHTMLElement = globalThis.HTMLElement;
    const prevTextArea = globalThis.HTMLTextAreaElement;
    const prevRaf = globalThis.requestAnimationFrame;
    const doc = installFakeDocument();
    globalThis.document = doc;
    globalThis.HTMLElement = FakeHTMLElement;
    globalThis.HTMLTextAreaElement = class HTMLTextAreaElement extends FakeHTMLElement {};
    globalThis.requestAnimationFrame = (cb) => {
      cb();
      return 1;
    };
    try {
      await fn(doc);
    } finally {
      globalThis.document = prevDoc;
      globalThis.HTMLElement = prevHTMLElement;
      globalThis.HTMLTextAreaElement = prevTextArea;
      globalThis.requestAnimationFrame = prevRaf;
    }
  };
}

/** 最近一次创建的带 data 属性的元素（队列中取当前 dialog 的控件）。 */
function findLastByData(doc, name) {
  for (let i = doc.elements.length - 1; i >= 0; i -= 1) {
    if (Object.prototype.hasOwnProperty.call(doc.elements[i].attrs, name)) {
      return doc.elements[i];
    }
  }
  return null;
}

function pressEscape(doc) {
  for (const fn of [...doc.keydownHandlers]) {
    fn({ key: 'Escape', target: doc.body, preventDefault() {}, stopPropagation() {} });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('打开锁定 body 滚动，确认关闭动画结束后释放', withFakeDom(async (doc) => {
  const { appConfirm } = await dialogModule();
  const p = appConfirm('确定要删除吗？');
  assert.ok(doc.body.classList.contains('ui-scroll-lock'), '打开即锁定背景滚动');

  const okBtn = findLastByData(doc, 'data-app-dialog-ok');
  assert.ok(okBtn, '对话框存在确定按钮');
  okBtn.click();
  assert.equal(await p, true, '确认解析为 true');
  // 关闭动画（0.2s）进行中保持锁定
  assert.ok(doc.body.classList.contains('ui-scroll-lock'), '关闭动画期间保持锁定');
  await sleep(320);
  assert.ok(!doc.body.classList.contains('ui-scroll-lock'), '关闭动画结束后释放锁定');
}));

test('取消按钮 / Esc / 遮罩点击各关闭路径均释放锁定', withFakeDom(async (doc) => {
  const { appConfirm } = await dialogModule();

  // 取消按钮
  let p = appConfirm('取消路径');
  assert.ok(doc.body.classList.contains('ui-scroll-lock'), '打开即锁定');
  findLastByData(doc, 'data-app-dialog-cancel').click();
  assert.equal(await p, false, '取消解析为 false');
  await sleep(320);
  assert.ok(!doc.body.classList.contains('ui-scroll-lock'), '取消关闭后解锁');

  // Esc（createDialog 关闭路径 → onClose → 取消）
  p = appConfirm('Esc 路径');
  pressEscape(doc);
  assert.equal(await p, false, 'Esc 解析为 false');
  await sleep(320);
  assert.ok(!doc.body.classList.contains('ui-scroll-lock'), 'Esc 关闭后解锁');

  // 遮罩点击
  p = appConfirm('遮罩路径');
  findLastByData(doc, 'data-app-dialog-backdrop').click();
  assert.equal(await p, false, '遮罩解析为 false');
  await sleep(320);
  assert.ok(!doc.body.classList.contains('ui-scroll-lock'), '遮罩关闭后解锁');
}));

test('appAlert 打开锁定、知道了关闭释放', withFakeDom(async (doc) => {
  const { appAlert } = await dialogModule();
  const p = appAlert('纯提示');
  assert.ok(doc.body.classList.contains('ui-scroll-lock'), 'alert 打开即锁定');

  findLastByData(doc, 'data-app-dialog-ok').click();
  await p;
  await sleep(320);
  assert.ok(!doc.body.classList.contains('ui-scroll-lock'), 'alert 关闭后解锁');
}));

test('重复关闭幂等：双击确认只释放一次，重新打开重新锁定', withFakeDom(async (doc) => {
  const { appConfirm } = await dialogModule();

  const p = appConfirm('第一次');
  const okBtn = findLastByData(doc, 'data-app-dialog-ok');
  okBtn.click();
  okBtn.click(); // 双击：settled 守卫保证只 finish 一次、只释放一次
  await p;
  await sleep(320);
  assert.ok(!doc.body.classList.contains('ui-scroll-lock'), '双击后锁定恰好释放一次');

  const p2 = appConfirm('第二次');
  assert.ok(doc.body.classList.contains('ui-scroll-lock'), '重新打开重新锁定');
  findLastByData(doc, 'data-app-dialog-ok').click();
  await p2;
  await sleep(320);
  assert.ok(!doc.body.classList.contains('ui-scroll-lock'), '再次关闭后解锁');
}));

test('队列多弹窗：前一个关闭不提前解锁，最后一个关闭才释放', withFakeDom(async (doc) => {
  const { appConfirm } = await dialogModule();
  const p1 = appConfirm('第一个');
  const p2 = appConfirm('第二个');
  assert.ok(doc.body.classList.contains('ui-scroll-lock'), '第一个打开即锁定');

  // 队列串行：同一时刻只有一条 dialog 实例
  const okBtns = doc.elements.filter((el) =>
    Object.prototype.hasOwnProperty.call(el.attrs, 'data-app-dialog-ok'),
  );
  assert.equal(okBtns.length, 1, '队列中同时只存在一个实例');

  okBtns[0].click();
  await p1;
  await sleep(320); // 第一个关闭动画结束：计数 2→1，锁定必须保留
  assert.ok(doc.body.classList.contains('ui-scroll-lock'), '第二个仍在展示，锁定保留');

  findLastByData(doc, 'data-app-dialog-ok').click();
  await p2;
  await sleep(320);
  assert.ok(!doc.body.classList.contains('ui-scroll-lock'), '最后一个关闭后解锁');
}));
