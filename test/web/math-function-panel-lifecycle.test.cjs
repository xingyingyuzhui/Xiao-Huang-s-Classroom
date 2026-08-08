/**
 * function-panel 生命周期合同（B5 / D3 样板）。
 *
 * 断言：DOM 捕获只在实例内（模块顶层无 document 访问）；controller 提供
 * dispose（清除 dataset.bound/ready 标记 + 委托 editor/listView 解绑）；
 * 二次 mount（同一 DOM 节点重建实例）能重新绑定，无「点按钮无反应」幽灵引用。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

const panelPath = path.join(root, 'apps/web/src/math/graph/function-panel.js');
const editorPath = path.join(root, 'apps/web/src/math/graph/function-editor.js');

function makeFakeElement(id) {
  return {
    id,
    dataset: {},
    listeners: {},
    innerHTML: '',
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
    removeEventListener(type) {
      delete this.listeners[type];
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
    appendChild() {},
    setAttribute() {},
    getAttribute() {
      return null;
    },
    replaceChildren() {},
  };
}

function installFakeDocument() {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeFakeElement(id));
      return elements.get(id);
    },
    querySelector() {
      return null; // 简化：跳过 createUiAddFnButton 的 toolbar 分支
    },
    createElement(tag) {
      return makeFakeElement(`_created-${tag}`);
    },
    addEventListener() {},
    removeEventListener() {},
  };
  return { document, elements };
}

const minimalContext = {
  state: {},
  activeFunction: () => null,
  mirrorActiveToLegacy: () => {},
  rebuildCurve: () => {},
  detachFunctionCurve: () => {},
  paintReadouts: () => {},
  syncSliders: () => {},
  store: () => null,
  idAllocator: () => null,
};

test('B5: dispose 清除绑定标记，二次 mount 重建绑定（无幽灵引用）', async () => {
  const prevDoc = globalThis.document;
  const { document, elements } = installFakeDocument();
  globalThis.document = document;
  try {
    const { createFunctionPanelController } = await import(
      pathToFileURL(panelPath).href
    );
    const target = document.getElementById('btnMathFnAddCancel');

    const first = createFunctionPanelController(minimalContext);
    first.bind();
    assert.equal(target.dataset.bound, '1', '首次 bind 打上绑定标记');

    first.dispose();
    assert.equal(target.dataset.bound, undefined, 'dispose 清除标记（允许重绑）');

    const second = createFunctionPanelController(minimalContext);
    second.bind();
    assert.equal(target.dataset.bound, '1', '二次 mount 重建绑定成功');

    second.dispose();
    second.dispose(); // 幂等
    assert.equal(target.dataset.bound, undefined);
  } finally {
    globalThis.document = prevDoc;
  }
});

test('B5: editor.dispose 清除 mathEditorBound（与 function-panel 对称）', async () => {
  const prevDoc = globalThis.document;
  const { document } = installFakeDocument();
  globalThis.document = document;
  try {
    const { createFunctionEditor } = await import(
      pathToFileURL(path.join(root, 'apps/web/src/math/graph/function-editor.js')).href
    );
    const modal = document.getElementById('mathFnEditModal');
    const editor = createFunctionEditor({ root: modal, callbacks: { onSubmit: () => {}, onCancel: () => {} } });
    editor.bind();
    assert.equal(modal.dataset.mathEditorBound, '1');
    editor.dispose();
    assert.equal(modal.dataset.mathEditorBound, undefined, 'dispose 清除 editor 绑定标记');
  } finally {
    globalThis.document = prevDoc;
  }
});

test('B5: 模块顶层无 DOM 捕获（捕获都在实例内）', () => {
  const src = fs.readFileSync(panelPath, 'utf8');
  // 模块顶层直接执行的初始化（const/let/export const）不得访问 document；
  // 函数体内的捕获（createUiAddFnButton / controller 构造）不在检查范围。
  assert.doesNotMatch(src, /^const [^=]*= document\./m, '顶层 const 初始化禁止 document');
  assert.doesNotMatch(src, /^let [^=]*= document\./m, '顶层 let 初始化禁止 document');
  assert.match(src, /function dispose/, 'function-panel 必须实现 dispose');
  assert.match(src, /delete el\.dataset\.bound/, 'dispose 必须清除绑定标记');
  assert.match(src, /listView\.dispose\?\.\(\)/, 'dispose 委托 listView 解绑');
});
