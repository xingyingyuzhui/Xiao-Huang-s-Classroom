/**
 * 设置抽屉（U3 高流量面体验补丁）合同测试。
 *
 * 行为断言（fake DOM + 可控 fetch，与 settings-toast-consumption.vitest.ts 互补）：
 * - 打开抽屉：焦点进入抽屉容器（tabindex -1），防重复打开；
 * - 关闭抽屉：焦点归还打开按钮（键盘流不丢）；
 * - 保存标识：请求在途时按钮禁用 + 「保存中…」，成功/失败均恢复；
 * - 恢复默认：危险操作走 appConfirm（源合同），取消不执行。
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  disabled: boolean;
  children: FakeElement[];
  attrs: Record<string, string>;
  dataset: Record<string, string>;
  style: Record<string, string>;
  listeners: Record<string, (ev?: unknown) => unknown>;
  parent: FakeElement | null;
  focusCalls: number;
  classList: FakeClassList;
  addEventListener(type: string, fn: (ev?: unknown) => unknown): void;
  setAttribute(name: string, value: string): void;
  appendChild(child: FakeElement): FakeElement;
  focus(): void;
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
    disabled: false,
    children: [],
    attrs: {},
    dataset: {},
    style: {},
    listeners: {},
    parent: null,
    focusCalls: 0,
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
    append(...children: FakeElement[]) {
      for (const c of children) {
        c.parent = el;
        el.children.push(c);
      }
    },
    focus() {
      el.focusCalls += 1;
    },
    remove() {
      if (el.parent) {
        const idx = el.parent.children.indexOf(el);
        if (idx >= 0) el.parent.children.splice(idx, 1);
        el.parent = null;
      }
    },
  };
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

/** 第 gateCall 次 fetch 挂起，其余立即成功（GET 返回主题/学科设置，写操作返回空） */
function makeGatedFetch(gateCall: number) {
  let calls = 0;
  let release!: (r: Response) => void;
  const gate = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const fn = (async (url: string | URL | Request, options?: RequestInit) => {
    calls += 1;
    if (calls === gateCall) return gate;
    const method = options?.method || 'GET';
    const data = method === 'GET' ? { theme: { id: 'default' }, subjectSettings: {} } : {};
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data }),
    } as unknown as Response;
  }) as typeof fetch;
  return { fetch: fn, release };
}

interface SettingsUI {
  setContext(ctx: { mode: string; subjectId: string | null }): void;
  dispose(): void;
}

async function boot(
  hookFetch: (url: string | URL | Request, options?: RequestInit) => Promise<Response>,
) {
  const prevDoc = globalThis.document;
  const prevFetch = globalThis.fetch;
  const prevWindow = (globalThis as Record<string, unknown>).window;
  const { doc, els, body } = installFakeDocument();
  globalThis.document = doc as unknown as Document;
  globalThis.fetch = hookFetch;
  (globalThis as Record<string, unknown>).window = { dispatchEvent() {} };
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
  return {
    ui,
    doc,
    els,
    body,
    restore() {
      globalThis.document = prevDoc;
      globalThis.fetch = prevFetch;
      if (prevWindow === undefined) delete (globalThis as Record<string, unknown>).window;
      else (globalThis as Record<string, unknown>).window = prevWindow;
    },
  };
}

test('打开抽屉焦点进入抽屉（tabindex -1），关闭归还打开按钮，防重复打开', async () => {
  const gated = makeGatedFetch(Number.POSITIVE_INFINITY); // 全部立即成功
  const h = await boot(gated.fetch);
  try {
    await (h.els.btnSettings.listeners.click as () => Promise<void>)();
    assert.equal(h.els.drawer.focusCalls, 1, '打开后焦点进入抽屉容器');
    assert.equal(h.els.drawer.attrs.tabindex, '-1', '抽屉容器可聚焦（tabindex -1）');
    assert.ok(h.els.drawer.classList.contains('is-open'), '抽屉已打开');
    assert.equal(h.els.drawer.attrs['aria-hidden'], 'false');

    // 防重复打开：已打开时再次点击不重复聚焦
    await (h.els.btnSettings.listeners.click as () => Promise<void>)();
    assert.equal(h.els.drawer.focusCalls, 1, '已打开时重复打开被守卫拦截');

    await (h.els.btnClose.listeners.click as () => Promise<void>)();
    assert.ok(!h.els.drawer.classList.contains('is-open'), '关闭按钮收起抽屉');
    assert.equal(h.els.btnSettings.focusCalls, 1, '关闭后焦点归还打开按钮');
  } finally {
    h.restore();
  }
});

test('保存标识：请求在途按钮禁用 + 「保存中…」，完成后恢复', async () => {
  const gated = makeGatedFetch(2); // 第 1 次（init 读设置）立即成功，第 2 次（保存）挂起
  const h = await boot(gated.fetch);
  try {
    h.ui.setContext({ mode: 'lab', subjectId: 'chemistry' });
    h.els.titleInput.value = '我的实验室';
    const clickPromise = (h.els.btnSaveBrand.listeners.click as () => Promise<void>)();
    assert.equal(h.els.btnSaveBrand.disabled, true, '保存在途时按钮禁用');
    assert.equal(h.els.btnSaveBrand.textContent, '保存中…', '在途文案切换「保存中…」');

    gated.release({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: {} }),
    } as unknown as Response);
    await clickPromise;
    assert.equal(h.els.btnSaveBrand.disabled, false, '完成后按钮恢复可用');
    assert.equal(h.els.btnSaveBrand.textContent, '保存标识', '文案恢复');
  } finally {
    h.restore();
  }
});

test('恢复默认：危险操作走 appConfirm（源合同），确认框选项齐备', () => {
  const src = fs.readFileSync(path.join(root, 'apps/web/src/shared/ui/settings.js'), 'utf8');
  assert.match(
    src,
    /import \{ appConfirm \} from '\.\/app-dialog\.js';/,
    '设置面危险操作走 app-dialog 家族',
  );
  assert.match(
    src,
    /确定恢复默认标题与图标？当前自定义标识将被覆盖。/,
    '恢复默认确认文案（说明影响范围）',
  );
  assert.match(src, /title: '恢复默认'/, '确认框标题');
  assert.match(src, /okText: '恢复'/, '确认按钮文案「恢复」');
  assert.match(src, /danger: true/, '危险操作标记');
});

test('Esc：设置抽屉在 app-dialog 打开时不连带关闭（源合同）', () => {
  const src = fs.readFileSync(path.join(root, 'apps/web/src/shared/ui/settings.js'), 'utf8');
  assert.match(
    src,
    /querySelector\('\.app-dialog-root\.is-open, \.ui-dialog:not\(\[hidden\]\)'\)/,
    'Esc 处理须检测顶层 dialog，避免确认框与抽屉同时关闭',
  );
  // 同一监听内：检测到 dialog 则 return，其后才是 closeDrawer
  assert.match(
    src,
    /app-dialog-root[\s\S]{0,80}?return;\s*\n\s*closeDrawer\(\);/,
    '检测到 dialog 时 return，不调用 closeDrawer',
  );
});
