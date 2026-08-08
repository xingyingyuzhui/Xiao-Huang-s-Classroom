/**
 * function-panel 生命周期合同（B5 / D3 样板）。
 *
 * 断言：DOM 捕获只在实例内（模块顶层无 document 访问）；controller 提供
 * dispose（清除 dataset.bound/ready 标记 + 委托 editor/listView 解绑）；
 * 二次 mount（同一 DOM 节点重建实例）能重新绑定，无「点按钮无反应」幽灵引用。
 *
 * P3：dispose 同时卸载 @xiaohuang/ui 控制器（createButton 等）——
 * 工具条/项目按钮在 dispose 后移出 DOM，二次 mount 重建且不双挂。
 *
 * B5：session.js 已迁 TS，function-panel → client → ai-subject → session 的
 * 间接链路在 Node 原生 ESM 下无法解析 .js→.ts，本测试迁 vitest（Vite 解析）。
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

const panelPath = path.join(root, 'apps/web/src/math/graph/function-panel.js');
const editorPath = path.join(root, 'apps/web/src/math/graph/function-editor.js');

function makeFakeElement(id: string) {
  const node = {
    id,
    dataset: {},
    listeners: {},
    innerHTML: '',
    className: '',
    children: [] as unknown[],
    parent: null as unknown | null,
    classList: {
      add(..._names: string[]) {},
      remove(..._names: string[]) {},
      toggle(_name: string, _force?: boolean) {
        return Boolean(_force);
      },
    },
    addEventListener(type: string, fn: unknown) {
      this.listeners[type] = fn;
    },
    removeEventListener(type: string) {
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
    appendChild(child: { parent: unknown }) {
      child.parent = node;
      this.children.push(child);
    },
    setAttribute() {},
    removeAttribute() {},
    getAttribute() {
      return null;
    },
    remove() {
      if (!node.parent) return;
      const index = (node.parent as { children: unknown[] }).children.indexOf(node);
      if (index >= 0) (node.parent as { children: unknown[] }).children.splice(index, 1);
      node.parent = null;
    },
    replaceChildren() {},
  };
  return node;
}

/** 侧栏宿主（.math-fn-toolbar / .math-project-row）：跟踪 children 以断言挂载/卸载。 */
function makeHost() {
  return {
    dataset: {},
    children: [] as unknown[],
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild(child: { parent: unknown }) {
      child.parent = this;
      this.children.push(child);
    },
  };
}

function installFakeDocument() {
  const elements = new Map();
  const toolbar = makeHost();
  const projectRow = makeHost();
  const document = {
    getElementById(id: string) {
      if (!elements.has(id)) elements.set(id, makeFakeElement(id));
      return elements.get(id);
    },
    querySelector(selector: string) {
      if (selector === '.math-fn-toolbar') return toolbar;
      if (selector === '.math-project-row') return projectRow;
      return null;
    },
    createElement(tag: string) {
      return makeFakeElement(`_created-${tag}`);
    },
    addEventListener() {},
    removeEventListener() {},
  };
  return { document, elements, toolbar, projectRow };
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

test('B5+P3: dispose 清除绑定标记并卸载 ui 控制器，二次 mount 重建且不双挂', async () => {
  const prevDoc = globalThis.document;
  const { document, elements, toolbar, projectRow } = installFakeDocument();
  globalThis.document = document;
  try {
    const { createFunctionPanelController } = await import(pathToFileURL(panelPath).href);
    const target = document.getElementById('btnMathFnAddCancel');

    const first = createFunctionPanelController(minimalContext);
    first.bind();
    assert.equal(target.dataset.bound, '1', '首次 bind 打上绑定标记');
    // P3.1：工具条（添加/AI/编辑）与项目行（导入/导出/重置）由 createButton 挂载
    assert.equal(toolbar.children.length, 3, 'P3: 工具条 3 个 createButton 按钮已挂载');
    assert.equal(projectRow.children.length, 3, 'P3: 项目行 3 个 createButton 按钮已挂载');
    assert.equal(toolbar.dataset.bound, '1', '工具条宿主打 bound 标记（幂等防双挂）');

    first.dispose();
    assert.equal(target.dataset.bound, undefined, 'dispose 清除标记（允许重绑）');
    assert.equal(toolbar.children.length, 0, 'P3: dispose 卸载 createButton 按钮节点');
    assert.equal(projectRow.children.length, 0, 'P3: dispose 卸载项目按钮节点');
    assert.equal(toolbar.dataset.bound, undefined, 'dispose 清除工具条宿主标记');

    const second = createFunctionPanelController(minimalContext);
    second.bind();
    assert.equal(target.dataset.bound, '1', '二次 mount 重建绑定成功');
    assert.equal(toolbar.children.length, 3, 'P3: 二次 mount 不双挂（仍 3 个按钮）');
    assert.equal(projectRow.children.length, 3, 'P3: 二次 mount 项目行不双挂');

    // 未 dispose 的重复 bind（真实应用 resume 路径）也必须幂等：宿主 bound 标记挡双挂
    second.bind();
    assert.equal(toolbar.children.length, 3, 'P3: 重复 bind 幂等，不产生重复按钮');

    second.dispose();
    second.dispose(); // 幂等
    assert.equal(target.dataset.bound, undefined);
    assert.equal(toolbar.children.length, 0);
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
    editor.dispose(); // 幂等
  } finally {
    globalThis.document = prevDoc;
  }
});

test('B5: 模块顶层无 DOM 捕获（捕获都在实例内）', () => {
  const src = fs.readFileSync(panelPath, 'utf8');
  // 模块顶层直接执行的初始化（const/let/export const）不得访问 document；
  // 函数体内的捕获（mountToolbarButtons / controller 构造）不在检查范围。
  assert.doesNotMatch(src, /^const [^=]*= document\./m, '顶层 const 初始化禁止 document');
  assert.doesNotMatch(src, /^let [^=]*= document\./m, '顶层 let 初始化禁止 document');
  assert.match(src, /function dispose/, 'function-panel 必须实现 dispose');
  assert.match(src, /delete el\.dataset\.bound/, 'dispose 必须清除绑定标记');
  assert.match(src, /listView\.dispose\?\.\(\)/, 'dispose 委托 listView 解绑');
  assert.match(src, /uiControllers\.splice\(0\)/, 'P3: dispose 卸载 @xiaohuang/ui 控制器');
});
