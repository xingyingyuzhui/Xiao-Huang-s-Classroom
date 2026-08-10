/**
 * app-dialog 滚动锁定（P4.3）：打开锁定 document.body 滚动（ui-scroll-lock），
 * 关闭动画结束后释放；覆盖确认/取消/Esc/遮罩各关闭路径、重复关闭幂等、
 * 队列多弹窗引用计数（前一个关闭不提前解锁）。
 *
 * 焦点合同（U2，2026-08-08）：打开焦点落入对话框（confirm 主按钮 / prompt 输入框）；
 * 关闭焦点归还 opener；Enter 在取消/关闭按钮上走原生 click（不误确定）；
 * 队列链复用链首 opener（连续 confirm 关闭后焦点回到最初触发元素，不丢锁不抢焦点）。
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

/** 以指定 target 派发 Enter（验证焦点所在控件的回车行为）。 */
function pressEnter(doc, target) {
  for (const fn of [...doc.keydownHandlers]) {
    fn({ key: 'Enter', target, preventDefault() {}, stopPropagation() {} });
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

// ---------------------------------------------------------------------------
// U2 · 焦点与滚动合同（2026-08-08）
// ---------------------------------------------------------------------------

/** 给 body 挂一个可见 opener，并设为当前焦点元素。 */
function makeOpener(doc) {
  const opener = doc.createElement('button');
  opener.className = 'opener';
  doc.body.appendChild(opener);
  doc.activeElement = opener;
  return opener;
}

test('U2.1 打开时焦点落入对话框：confirm 聚焦主按钮，prompt 聚焦输入框', withFakeDom(async (doc) => {
  const { appConfirm, appPrompt } = await dialogModule();

  const p = appConfirm('确认路径');
  const okBtn = findLastByData(doc, 'data-app-dialog-ok');
  assert.ok(okBtn, '存在确定按钮');
  assert.equal(doc.activeElement, okBtn, 'confirm 打开后焦点落在主按钮');

  okBtn.click();
  await p;

  const p2 = appPrompt('输入路径');
  const input = findLastByData(doc, 'data-app-dialog-input');
  assert.ok(input, 'prompt 存在输入框');
  assert.equal(doc.activeElement, input, 'prompt 打开后焦点落在输入框');

  // 输入框回车提交
  input.value = '答案';
  pressEnter(doc, input);
  assert.equal(await p2, '答案', 'prompt 输入框回车解析为输入值');
}));

test('U2.2 关闭后焦点归还 opener：确定 / 取消 / Esc 三路径', withFakeDom(async (doc) => {
  const { appConfirm } = await dialogModule();
  const opener = makeOpener(doc);

  // 确定
  let p = appConfirm('路径一');
  assert.notEqual(doc.activeElement, opener, '打开后焦点移入对话框');
  findLastByData(doc, 'data-app-dialog-ok').click();
  assert.equal(await p, true, '确定解析为 true');
  assert.equal(doc.activeElement, opener, '确定关闭后焦点归还 opener');

  // 取消
  p = appConfirm('路径二');
  findLastByData(doc, 'data-app-dialog-cancel').click();
  assert.equal(await p, false, '取消解析为 false');
  assert.equal(doc.activeElement, opener, '取消关闭后焦点归还 opener');

  // Esc
  p = appConfirm('路径三');
  pressEscape(doc);
  assert.equal(await p, false, 'Esc 解析为 false');
  assert.equal(doc.activeElement, opener, 'Esc 关闭后焦点归还 opener');

  await sleep(320);
  assert.ok(!doc.body.classList.contains('ui-scroll-lock'), '全部关闭后解锁');
}));

test('U2.3 焦点在取消按钮上时 Enter 不误触发确定（走原生 click 取消）', withFakeDom(async (doc) => {
  const { appConfirm } = await dialogModule();
  const p = appConfirm('取消按钮回车');
  const cancelBtn = findLastByData(doc, 'data-app-dialog-cancel');
  assert.ok(cancelBtn, '存在取消按钮');

  // 焦点移到取消按钮后按 Enter：不应确认，弹窗应保持打开
  doc.activeElement = cancelBtn;
  pressEnter(doc, cancelBtn);
  let settled = false;
  p.then(() => { settled = true; });
  await sleep(20);
  assert.equal(settled, false, 'Enter 落在取消按钮上不应触发确定');
  assert.ok(doc.body.classList.contains('ui-scroll-lock'), '弹窗仍打开，滚动锁定保留');

  // 原生 click（浏览器中按钮回车等价于 click）→ 取消
  cancelBtn.click();
  assert.equal(await p, false, '取消按钮 click 解析为 false');
  await sleep(320);
  assert.ok(!doc.body.classList.contains('ui-scroll-lock'), '取消关闭后解锁');
}));

test('U2.3 连续多次开关：引用计数不泄漏，锁每次释放干净', withFakeDom(async (doc) => {
  const { appConfirm } = await dialogModule();
  for (let i = 0; i < 4; i += 1) {
    const p = appConfirm(`第 ${i} 次`);
    assert.ok(doc.body.classList.contains('ui-scroll-lock'), `第 ${i} 次打开锁定`);
    findLastByData(doc, 'data-app-dialog-ok').click();
    assert.equal(await p, true, `第 ${i} 次确定解析为 true`);
    await sleep(320);
    assert.ok(!doc.body.classList.contains('ui-scroll-lock'), `第 ${i} 次关闭后解锁`);
  }
}));

test('U2.4 队列连续两次 confirm：链式复用首 opener，焦点回到最初触发元素', withFakeDom(async (doc) => {
  const { appConfirm } = await dialogModule();
  const opener = makeOpener(doc);

  const p1 = appConfirm('第一个');
  const p2 = appConfirm('第二个');
  assert.ok(doc.body.classList.contains('ui-scroll-lock'), '第一个打开即锁定');

  const okBtns = doc.elements.filter((el) =>
    Object.prototype.hasOwnProperty.call(el.attrs, 'data-app-dialog-ok'),
  );
  assert.equal(okBtns.length, 1, '队列中同时只存在一个实例');

  // 关闭第一个：焦点应进入第二个弹窗的主按钮，而不是丢给已销毁的按钮或 opener
  okBtns[0].click();
  await p1;
  const ok2 = findLastByData(doc, 'data-app-dialog-ok');
  assert.notEqual(ok2, okBtns[0], '第二个弹窗有独立的确定按钮');
  assert.equal(doc.activeElement, ok2, '第二个弹窗打开后焦点落在其主按钮');

  // 关闭第二个：焦点链式回到最初 opener（而非第一个弹窗内部按钮）
  ok2.click();
  assert.equal(await p2, true, '第二个确定解析为 true');
  assert.equal(doc.activeElement, opener, '全部关闭后焦点回到最初 opener');

  await sleep(320);
  assert.ok(!doc.body.classList.contains('ui-scroll-lock'), '最后一个关闭后解锁');
}));

test('串行 await 两次 confirm：resolve 前归还焦点，第二窗 opener 不是第一窗确定按钮', withFakeDom(async (doc) => {
  const { appConfirm } = await dialogModule();
  const opener = makeOpener(doc);

  const p1 = appConfirm('串行第一');
  const ok1 = findLastByData(doc, 'data-app-dialog-ok');
  assert.ok(ok1, '第一窗确定按钮存在');
  ok1.click();
  assert.equal(await p1, true, '第一窗确定');
  // finish 须在 resolve 前 focus opener，否则串行第二窗会把 ok1 当链首
  assert.equal(doc.activeElement, opener, '第一窗关闭后焦点已归还 opener（在 await 继续前）');

  const p2 = appConfirm('串行第二');
  const ok2 = findLastByData(doc, 'data-app-dialog-ok');
  assert.ok(ok2, '第二窗确定按钮存在');
  assert.notEqual(ok2, ok1, '第二窗有新确定按钮');
  ok2.click();
  assert.equal(await p2, true, '第二窗确定');
  assert.equal(doc.activeElement, opener, '串行第二窗关闭后焦点仍归还最初 opener');

  await sleep(320);
  assert.ok(!doc.body.classList.contains('ui-scroll-lock'), '串行关闭后解锁');
}));
