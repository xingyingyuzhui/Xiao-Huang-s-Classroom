/**
 * 设置抽屉轻提示执行测试（P4.2）：fake DOM + 假 fetch 驱动 initSettingsUI 保存路径，
 * 断言 toast 挂载 / kind（success|error）/ 覆盖式单条 / dispose 幂等。
 *
 * B5 先例（math-function-panel-lifecycle.vitest.ts）：settings.js → client.js →
 * ai-subject.js → session.js(TS) 的间接链路在 Node 原生 ESM 下无法解析 .js→.ts，
 * 执行测试放 vitest（Vite 解析）；源合同断言见 settings-toast-consumption.test.cjs。
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

interface FakeClassList {
  add(...names: string[]): void;
  remove(...names: string[]): void;
  toggle(name: string, force?: boolean): void;
  contains(name: string): boolean;
}

interface FakeElement {
  tagName: string;
  className: string;
  textContent: string;
  value: string;
  src: string;
  hidden: boolean;
  children: FakeElement[];
  attrs: Record<string, string>;
  dataset: Record<string, string>;
  style: Record<string, string>;
  listeners: Record<string, (ev?: unknown) => unknown>;
  parent: FakeElement | null;
  classList: FakeClassList;
  addEventListener(type: string, fn: (ev?: unknown) => unknown): void;
  setAttribute(name: string, value: string): void;
  appendChild(child: FakeElement): FakeElement;
  remove(): void;
}

function makeFakeElement(tag = 'div'): FakeElement {
  const classes = new Set<string>();
  const el: FakeElement = {
    tagName: tag.toUpperCase(),
    className: '',
    textContent: '',
    value: '',
    src: '',
    hidden: false,
    children: [],
    attrs: {},
    dataset: {},
    style: {},
    listeners: {},
    parent: null,
    classList: {
      add(...names: string[]) {
        names.forEach((n) => classes.add(n));
      },
      remove(...names: string[]) {
        names.forEach((n) => classes.delete(n));
      },
      toggle(name: string, force?: boolean) {
        const on = force === undefined ? !classes.has(name) : Boolean(force);
        if (on) classes.add(name);
        else classes.delete(name);
      },
      contains(name: string) {
        return classes.has(name);
      },
    },
    addEventListener(type: string, fn: (ev?: unknown) => unknown) {
      el.listeners[type] = fn;
    },
    setAttribute(name: string, value: string) {
      el.attrs[name] = String(value);
    },
    appendChild(child: FakeElement) {
      child.parent = el;
      el.children.push(child);
      return child;
    },
    remove() {
      if (el.parent) {
        const idx = el.parent.children.indexOf(el);
        if (idx >= 0) el.parent.children.splice(idx, 1);
        el.parent = null;
      }
    },
  };
  // className 直接赋值与 classList 读写共享同一集合（贴近真实 DOM）
  Object.defineProperty(el, 'className', {
    get() {
      return [...classes].join(' ');
    },
    set(value: string) {
      classes.clear();
      String(value)
        .split(/\s+/)
        .filter(Boolean)
        .forEach((n) => classes.add(n));
    },
  });
  return el;
}

interface FakeDocument {
  body: FakeElement;
  documentElement: FakeElement;
  title: string;
  querySelector(sel: string): FakeElement | null;
  querySelectorAll(): FakeElement[];
  getElementById(id: string): FakeElement | null;
  createElement(tag: string): FakeElement;
  addEventListener(): void;
  removeEventListener(): void;
}

function installFakeDocument(): {
  doc: FakeDocument;
  els: Record<string, FakeElement>;
  body: FakeElement;
} {
  const els: Record<string, FakeElement> = {
    btnSettings: makeFakeElement('button'),
    backdrop: makeFakeElement('div'),
    drawer: makeFakeElement('aside'),
    btnClose: makeFakeElement('button'),
    themeSection: makeFakeElement('section'),
    subjectSection: makeFakeElement('section'),
    brandBlock: makeFakeElement('div'),
    iconPreview: makeFakeElement('img'),
    iconInput: makeFakeElement('input'),
    titleInput: makeFakeElement('input'),
    btnSaveBrand: makeFakeElement('button'),
    btnResetBrand: makeFakeElement('button'),
    themePicker: makeFakeElement('div'),
    defaultPage: makeFakeElement('select'),
    defaultPageBlock: makeFakeElement('div'),
    aiSection: makeFakeElement('section'),
    aiBase: makeFakeElement('input'),
    aiKey: makeFakeElement('input'),
    aiModel: makeFakeElement('select'),
    btnSaveAi: makeFakeElement('button'),
    eyebrow: makeFakeElement('span'),
    brandTitle: makeFakeElement('span'),
    brandIcon: makeFakeElement('img'),
  };
  const bySelector: Record<string, FakeElement> = {
    '#btnSettings': els.btnSettings,
    '#settingsBackdrop': els.backdrop,
    '#settingsDrawer': els.drawer,
    '#btnSettingsClose': els.btnClose,
    '#settingsThemeSection': els.themeSection,
    '#settingsSubjectSection': els.subjectSection,
    '#settingsBrandBlock': els.brandBlock,
    '#brandIconPreview': els.iconPreview,
    '#brandIconInput': els.iconInput,
    '#brandTitleInput': els.titleInput,
    '#btnSaveBrand': els.btnSaveBrand,
    '#btnResetBrand': els.btnResetBrand,
    '#themePicker': els.themePicker,
    '#settingDefaultPage': els.defaultPage,
    '#settingsDefaultPageBlock': els.defaultPageBlock,
    '#settingsAiSection': els.aiSection,
    '#aiApiBase': els.aiBase,
    '#aiApiKey': els.aiKey,
    '#aiModel': els.aiModel,
    '#btnSaveAi': els.btnSaveAi,
    '.brand-eyebrow': els.eyebrow,
  };
  const body = makeFakeElement('body');
  const doc: FakeDocument = {
    body,
    documentElement: makeFakeElement('html'),
    title: '',
    querySelector(sel: string) {
      return bySelector[sel] ?? null;
    },
    querySelectorAll() {
      return [];
    },
    getElementById(id: string) {
      if (id === 'appBrandTitle') return els.brandTitle;
      if (id === 'appBrandIcon') return els.brandIcon;
      return null;
    },
    createElement(tag: string) {
      return makeFakeElement(tag);
    },
    addEventListener() {},
    removeEventListener() {},
  };
  return { doc, els, body };
}

interface SettingsUI {
  setContext(ctx: { mode: string; subjectId: string | null }): void;
  dispose(): void;
}

function makeFakeFetch(fail: boolean): typeof fetch {
  return (async (url: string | URL | Request, options?: RequestInit) => {
    if (fail) throw new TypeError('Failed to fetch');
    const method = options?.method || 'GET';
    const data = method === 'GET' ? { theme: { id: 'default' }, subjectSettings: {} } : {};
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data }),
    } as unknown as Response;
  }) as typeof fetch;
}

function toasts(body: FakeElement): FakeElement[] {
  return body.children.filter((c) => c.className.includes('ui-toast'));
}

test('保存标识成功/失败走 ui Toast（kind + 覆盖式单条 + dispose 幂等）', async () => {
  const prevDoc = globalThis.document;
  const prevFetch = globalThis.fetch;
  const { doc, els, body } = installFakeDocument();
  globalThis.document = doc as unknown as Document;
  globalThis.fetch = makeFakeFetch(false);
  try {
    const { initSettingsUI } = (await import(
      pathToFileURL(path.join(root, 'apps/web/src/shared/ui/settings.js')).href
    )) as {
      initSettingsUI: (opts: {
        getClassroomCapabilities: (subjectId: string) => {
          brand: boolean;
          defaultPage: boolean;
          ai: boolean;
        };
      }) => Promise<SettingsUI>;
    };
    const ui = await initSettingsUI({
      getClassroomCapabilities: () => ({ brand: true, defaultPage: false, ai: false }),
    });
    ui.setContext({ mode: 'lab', subjectId: 'chemistry' });
    els.titleInput.value = '我的实验室';

    // 成功路径：保存后挂一条 is-success toast，文案不变
    await (els.btnSaveBrand.listeners.click as () => Promise<void>)();
    assert.equal(toasts(body).length, 1, '保存成功只出一条 toast');
    const okToast = toasts(body)[0];
    assert.ok(okToast.className.includes('is-success'), '成功提示走 success kind');
    assert.equal(okToast.textContent, '已保存', '提示内容保持');
    assert.equal(okToast.attrs.role, 'status', 'toast 自带 role=status 播报');

    // 覆盖式：连续两次操作同刻只有一条 toast（与旧内联状态一致）
    await (els.btnSaveBrand.listeners.click as () => Promise<void>)();
    assert.equal(toasts(body).length, 1, '新提示覆盖旧提示');
    assert.ok(toasts(body)[0].className.includes('is-success'));

    // dispose 幂等：清掉活动 toast，重复调用安全
    ui.dispose();
    ui.dispose();
    assert.equal(toasts(body).length, 0, 'dispose 移除活动 toast');

    // 失败路径：fetch 失败 → is-error toast，文案含「保存失败」
    globalThis.fetch = makeFakeFetch(true);
    await (els.btnSaveBrand.listeners.click as () => Promise<void>)();
    const errToast = toasts(body)[0];
    assert.ok(errToast, '失败提示仍走 toast');
    assert.ok(errToast.className.includes('is-error'), '失败提示走 error kind');
    assert.match(errToast.textContent, /保存失败/);
    ui.dispose();
    assert.equal(toasts(body).length, 0, '最终 dispose 无残留');
  } finally {
    globalThis.document = prevDoc;
    globalThis.fetch = prevFetch;
  }
});
