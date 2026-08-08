/**
 * 备课包面板（AI 课壳）UI 库采用合同（P6.1/P6.2/P6.3）。
 *
 * 断言：
 * - 顶栏工具区三个主按钮由 @xiaohuang/ui createButton 创建（class 桥接旧
 *   .btn/.btn-sm/.ghost，行为逐字保持：新建/导入/导出）；
 * - partial HTML 不再含静态工具按钮（单一挂载点）；
 * - dispose 幂等、二次挂载可重建；删除确认仍走现有 appConfirm（Dialog 路径）。
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

const lessonPacksPath = path.join(root, 'apps/web/src/chemistry/ai-classroom/lesson-packs.js');
const partialPath = path.join(
  root,
  'apps/web/src/subjects/classrooms/partials/chemistry-panels.partial.html',
);

/** 极简 fake element：绑定/解绑 listener + classList + 子节点（对齐 test-kit 鸭子类型）。 */
function makeFakeElement(id: string) {
  const el: Record<string, unknown> & {
    classSet: Set<string>;
    children: unknown[];
    listeners: Record<string, Array<(e?: unknown) => void>>;
    parentNode: unknown;
  } = {
    id,
    dataset: {},
    hidden: false,
    disabled: false,
    value: '',
    innerHTML: '',
    children: [],
    listeners: {},
    parentNode: null,
    classSet: new Set<string>(),
    addEventListener(type: string, fn: (e?: unknown) => void) {
      (el.listeners[type] = el.listeners[type] || []).push(fn);
    },
    removeEventListener(type: string, fn: (e?: unknown) => void) {
      el.listeners[type] = (el.listeners[type] || []).filter((f) => f !== fn);
    },
    click() {
      for (const fn of el.listeners.click || []) fn({ preventDefault() {} });
    },
    appendChild(child: unknown) {
      (child as { parentNode: unknown }).parentNode = el;
      el.children.push(child);
    },
    append(...nodes: unknown[]) {
      for (const n of nodes) {
        (n as { parentNode: unknown }).parentNode = el;
        el.children.push(n);
      }
    },
    remove() {
      const parent = el.parentNode as {
        children: unknown[];
      } | null;
      if (parent) parent.children = parent.children.filter((c) => c !== el);
      el.parentNode = null;
    },
    setAttribute() {},
    removeAttribute() {},
    getAttribute() {
      return null;
    },
    // 编辑器内按钮绑定仅需可挂 listener 的占位（真实路径在浏览器）
    querySelector() {
      return makeFakeElement(`_qs-${id}`);
    },
    querySelectorAll() {
      return [];
    },
  };
  Object.defineProperty(el, 'className', {
    get() {
      return [...el.classSet].join(' ');
    },
    set(value: string) {
      el.classSet = new Set(String(value).split(/\s+/).filter(Boolean));
    },
  });
  Object.defineProperty(el, 'classList', {
    value: {
      add: (...names: string[]) => names.forEach((n) => el.classSet.add(n)),
      remove: (...names: string[]) => names.forEach((n) => el.classSet.delete(n)),
      toggle(name: string, force?: boolean) {
        if (force === undefined) {
          if (el.classSet.has(name)) {
            el.classSet.delete(name);
            return false;
          }
          el.classSet.add(name);
          return true;
        }
        if (force) el.classSet.add(name);
        else el.classSet.delete(name);
        return force;
      },
      contains(name: string) {
        return el.classSet.has(name);
      },
    },
  });
  return el;
}

interface Harness {
  select: (sel: string) => unknown;
  elements: Map<string, ReturnType<typeof makeFakeElement>>;
  toolbar: ReturnType<typeof makeFakeElement>;
  importInput: ReturnType<typeof makeFakeElement>;
  createdAnchors: ReturnType<typeof makeFakeElement>[];
}

function installFakeDocument(): Harness {
  const elements = new Map<string, ReturnType<typeof makeFakeElement>>();
  const register = (id: string) => {
    const el = makeFakeElement(id);
    elements.set(id, el);
    return el;
  };
  register('lessonPackList');
  register('lessonPackDetail');
  register('lessonPackEditor');
  const importInput = register('lessonPackImportInput');
  const toolbar = makeFakeElement('lessonPackToolbar');
  const createdAnchors: ReturnType<typeof makeFakeElement>[] = [];

  const document = {
    createElement(tag: string) {
      const el = makeFakeElement(`created-${tag}-${createdAnchors.length}`);
      if (tag === 'a') createdAnchors.push(el);
      return el;
    },
  };
  globalThis.document = document as unknown as Document;

  return {
    select(sel: string) {
      if (sel === '.lesson-pack-toolbar') return toolbar;
      if (sel.startsWith('#')) return elements.get(sel.slice(1)) ?? null;
      return null;
    },
    elements,
    toolbar,
    importInput,
    createdAnchors,
  };
}

function makeApis(overrides: Record<string, unknown> = {}) {
  return {
    lessonPackApi: {
      list: async () => ({ packs: [] }),
      create: async () => ({ id: 'p-new' }),
      update: async () => ({}),
      remove: async () => ({}),
      exportData: async (id: string) => ({ metadata: { name: id }, packs: [] }),
      importData: async () => ({}),
    },
    labsApi: {
      list: async () => ({ labs: [] }),
      exportPack: async () => ({ name: '实验包', labs: [] }),
    },
    ...overrides,
  };
}

async function makeController(harness: Harness, apis: Record<string, unknown>) {
  const prevDoc = globalThis.document;
  try {
    const { createLessonPacksController } = await import(
      pathToFileURL(lessonPacksPath).href
    );
    return createLessonPacksController({
      select: harness.select,
      escapeHtml: (s: unknown) => String(s ?? ''),
      lessonPackApi: apis.lessonPackApi,
      labsApi: apis.labsApi,
    });
  } finally {
    globalThis.document = prevDoc;
  }
}

/** 排空点击处理器内的 async 微任务（onClick 先 await refreshLabOptions） */
const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0));

test('P6.1: 工具区按钮由 createButton 创建，className 桥接旧 .btn 类', async () => {
  const h = installFakeDocument();
  const controller = await makeController(h, makeApis());
  await controller.init();

  assert.equal(h.toolbar.children.length, 3, '三个工具按钮全部由 JS 挂载');
  const [newBtn, importBtn, exportBtn] = h.toolbar.children as Array<{
    className: string;
  }>;
  assert.match(newBtn.className, /\bui-btn\b/, '组件自带 ui-btn 基类');
  assert.match(newBtn.className, /\bbtn\b/, '桥接旧 .btn');
  assert.match(newBtn.className, /\bbtn-sm\b/, '桥接旧 .btn-sm');
  assert.doesNotMatch(newBtn.className, /\bghost\b/, '新建不是 ghost');
  assert.match(importBtn.className, /\bbtn\b|\bbtn-sm\b/, '导入桥接旧类');
  assert.match(importBtn.className, /\bghost\b/, '导入为 ghost');
  assert.match(exportBtn.className, /\bghost\b/, '导出为 ghost');
  assert.equal(
    (h.toolbar.children as Array<{ textContent?: string }>).map((c) => c.textContent).join('|'),
    '新建备课包|导入备课包/实验包|导出实验包',
    '按钮文字与顺序保持',
  );
  controller.dispose();
});

test('P6.1: 行为逐字保持——新建打开编辑器 / 导入触发文件选择 / 导出触发下载', async () => {
  const h = installFakeDocument();
  const controller = await makeController(h, makeApis());
  await controller.init();

  const [newBtn, importBtn, exportBtn] = h.toolbar.children as Array<{
    click: () => void;
  }>;

  let inputClicks = 0;
  h.importInput.click = () => {
    inputClicks += 1;
  };

  (newBtn as { click: () => void }).click();
  await flushAsync();
  const editor = h.elements.get('lessonPackEditor');
  assert.equal(editor?.hidden, false, '新建按钮展开编辑器');
  assert.match(String(editor?.innerHTML), /新建备课包/, '编辑器为新建模式标题');
  assert.match(String(editor?.innerHTML), /btnLpSave/, '编辑器保留保存按钮挂点');

  importBtn.click();
  assert.equal(inputClicks, 1, '导入按钮触发隐藏文件输入');

  exportBtn.click();
  await flushAsync();
  assert.equal(h.createdAnchors.length, 1, '导出实验包创建下载锚点');
  const anchor = h.createdAnchors[0];
  assert.match(String(anchor.download), /^实验包-\d{4}-\d{2}-\d{2}\.json$/, '下载文件名保持');
  controller.dispose();
});

test('P6.1: dispose 幂等且二次挂载可重建（无幽灵引用）', async () => {
  const h = installFakeDocument();
  const controller = await makeController(h, makeApis());
  await controller.init();
  assert.equal(h.toolbar.children.length, 3);

  // 二次 init 不重复挂载（挂载守卫）
  await controller.init();
  assert.equal(h.toolbar.children.length, 3, '重复 init 不产生重复按钮');

  controller.dispose();
  assert.equal(h.toolbar.children.length, 0, 'dispose 移除全部工具按钮');

  // 已释放按钮点击不再触发行为
  const editorBefore = h.elements.get('lessonPackEditor')?.hidden;
  (h.toolbar.children as Array<{ click: () => void }>)[0]?.click?.();
  assert.equal(h.elements.get('lessonPackEditor')?.hidden, editorBefore, 'dispose 后点击无副作用');

  controller.dispose(); // 幂等
  await controller.init(); // dispose 后可重新挂载
  assert.equal(h.toolbar.children.length, 3, 'dispose 后二次 init 重建按钮');
  controller.dispose();
});

test('P6.1: partial HTML 去除静态工具按钮，保留隐藏文件输入（单一挂载点）', () => {
  const html = fs.readFileSync(partialPath, 'utf8');
  assert.doesNotMatch(html, /id="btnLessonPackNew"/, '新建按钮不再静态渲染');
  assert.doesNotMatch(html, /id="btnLessonPackImport"/, '导入按钮不再静态渲染');
  assert.doesNotMatch(html, /id="btnLabPackExport"/, '导出按钮不再静态渲染');
  assert.match(html, /id="lessonPackImportInput"/, '文件输入仍由 partial 提供');
  assert.match(html, /class="lesson-pack-toolbar"/, '工具栏容器保留为挂载点');
});

test('P6.1/P6.2: 模块走 @xiaohuang/ui，删除确认保留 appConfirm Dialog 路径', () => {
  const src = fs.readFileSync(lessonPacksPath, 'utf8');
  assert.match(src, /import \{ createButton \} from '@xiaohuang\/ui';/, '主按钮走 UI 库');
  assert.match(src, /toolbarButtons\.length/, '挂载守卫防止重复挂载');
  assert.match(src, /function dispose\(\)/, '控制器提供 dispose');
  assert.match(
    src,
    /await appConfirm\(`确定删除备课包/,
    '删除仍走现有 appConfirm（app-dialog adapter）确认路径',
  );
});
