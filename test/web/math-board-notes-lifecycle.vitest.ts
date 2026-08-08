/**
 * board-notes chrome 生命周期（P5B 笔记条库化 / B5 样板）。
 *
 * 断言：笔记条全部按钮由 @xiaohuang/ui createButton 渲染（ui-btn 基类 +
 * math-board-notes-* 桥接类，无 HTML 字符串控件）；点击行为与旧事件委托等价
 * （开关 / 切工具 / 线宽 / 颜色 / 撤销 / 清空 / 完成）；dispose 释放 ui
 * 控制器并清除 host 绑定标记，重复 dispose 安全。
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createFakeDocument } from '@xiaohuang/test-kit';
import type { FakeDocument, FakeElement } from '@xiaohuang/test-kit';
import root from '../helpers/repo-root.js';

const NOTES_PATH = path.join(root, 'apps/web/src/math/shared/board-notes.js');
const COMPASS_PATH = path.join(root, 'apps/web/src/math/shared/board-compass.js');
const STYLE_PANEL_PATH = path.join(root, 'apps/web/src/math/shared/object-style-panel.js');

type Rect = { left: number; top: number; width: number; height: number };

type CanvasLike = FakeElement & {
  getContext: () => CanvasRenderingContext2D | null;
  getBoundingClientRect: () => Rect;
};

type HostLike = FakeElement & {
  querySelector: (sel: string) => FakeElement | null;
  getBoundingClientRect: () => Rect;
};

type FakeStyle = FakeElement['style'] & Record<string, unknown>;

function installFakeDom(): { doc: FakeDocument; host: HostLike } {
  const doc = createFakeDocument() as FakeDocument & {
    body: FakeElement;
    addEventListener: () => void;
    removeEventListener: () => void;
  };
  doc.body = doc.createElement('body');
  doc.addEventListener = () => {};
  doc.removeEventListener = () => {};

  const baseCreate = doc.createElement.bind(doc);
  doc.createElement = (tag: string) => {
    const el = baseCreate(tag);
    if (tag === 'canvas') {
      const c = el as CanvasLike;
      c.getContext = () => null;
      c.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
      return c;
    }
    return el;
  };

  const host = doc.createElement('host') as HostLike;
  host.querySelector = () => null;
  host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  return { doc, host };
}

async function withFakeGlobals(fn: (doc: FakeDocument, host: HostLike) => Promise<void> | void) {
  const { doc, host } = installFakeDom();
  const prevDocument = globalThis.document;
  const prevComputedStyle = globalThis.getComputedStyle;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevWindow = globalThis.window;
  const prevResizeObserver = globalThis.ResizeObserver;
  try {
    globalThis.document = doc as unknown as Document;
    globalThis.getComputedStyle = (() => ({
      position: 'static',
    })) as unknown as typeof globalThis.getComputedStyle;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    }) as unknown as typeof globalThis.requestAnimationFrame;
    globalThis.window = {
      devicePixelRatio: 1,
      setTimeout: (cb: () => void) => {
        cb();
        return 0;
      },
    } as unknown as Window & typeof globalThis;
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    // 预热 setActive 动态导入的两个 dismiss 模块，避免测试中途未决 rejection
    await import(pathToFileURL(COMPASS_PATH).href);
    await import(pathToFileURL(STYLE_PANEL_PATH).href);
    await fn(doc, host);
  } finally {
    globalThis.document = prevDocument;
    globalThis.getComputedStyle = prevComputedStyle;
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.window = prevWindow;
    globalThis.ResizeObserver = prevResizeObserver;
  }
}

function firePointer(canvas: FakeElement, type: string, ev: Record<string, unknown>) {
  for (const fn of canvas.listeners[type] || []) fn(ev);
}

/** 让 setActive 触发的动态导入 .then（dismiss 回调）在 globals 还原前跑完 */
function drainAsyncWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function pointerEv(clientX: number, clientY: number) {
  return {
    button: 0,
    pointerId: 1,
    clientX,
    clientY,
    preventDefault() {},
    stopPropagation() {},
  };
}

test('P5B: notes chrome buttons are createButton-built and behave like the old delegation', async () => {
  await withFakeGlobals(async (doc, host) => {
    const { attachBoardNotes } = await import(pathToFileURL(NOTES_PATH).href);
    const board = {
      containerObj: host,
      attr: { pan: { enabled: true }, zoom: { wheel: true } },
      origin: { scrCoords: [1, 0, 0] },
      unitX: 1,
      unitY: 1,
      on() {},
      off() {},
    };
    const api = attachBoardNotes(board, { host, storageKey: '' });

    const rootEl = host.children[0] as FakeElement;
    const canvas = rootEl.children[0] as CanvasLike;
    const dock = host.children[1] as FakeElement;
    const chrome = dock.children[0] as FakeElement;
    const toolbar = chrome.children[0] as FakeElement;
    const toggle = chrome.children[1] as FakeElement;
    const [toolsGroup, widthsGroup, colorsGroup, actionsGroup] = toolbar.children as FakeElement[];
    const [pen, eraser] = toolsGroup.children as FakeElement[];

    // 桥接：全部按钮带 ui-btn 基类 + 旧类
    for (const btn of [
      pen,
      eraser,
      ...widthsGroup.children,
      ...colorsGroup.children,
      ...actionsGroup.children,
      toggle,
    ]) {
      assert.ok(btn.classList.contains('ui-btn'), 'button carries ui-btn base class');
    }
    assert.ok(pen.classList.contains('math-board-notes-tool'));
    assert.ok(eraser.classList.contains('math-board-notes-tool'));
    assert.equal(widthsGroup.children.length, 3);
    assert.equal(colorsGroup.children.length, 6);
    assert.equal(actionsGroup.children.length, 3);
    assert.ok(toggle.classList.contains('math-board-notes-toggle'));

    // 初始状态
    assert.equal(api.isActive(), false);
    assert.equal(toolbar.hidden, true);
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    assert.ok(pen.classList.contains('is-on'));
    assert.ok((widthsGroup.children[1] as FakeElement).classList.contains('is-on')); // 中
    assert.ok((colorsGroup.children[0] as FakeElement).classList.contains('is-on')); // ink

    // 打开笔记模式
    toggle.click();
    assert.equal(api.isActive(), true);
    assert.ok(rootEl.classList.contains('is-active'));
    assert.equal(toolbar.hidden, false);
    assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    assert.ok(toggle.classList.contains('is-on'));
    assert.equal((canvas.style as FakeStyle).pointerEvents, 'auto');
    assert.ok(toolbar.classList.contains('is-open')); // rAF stub 立即执行

    // 切换工具：橡皮 → is-eraser + is-on 迁移
    eraser.click();
    assert.ok(rootEl.classList.contains('is-eraser'));
    assert.ok(eraser.classList.contains('is-on'));
    assert.ok(!pen.classList.contains('is-on'));
    pen.click();
    assert.ok(!rootEl.classList.contains('is-eraser'));

    // 线宽 / 颜色单选迁移
    (widthsGroup.children[2] as FakeElement).click(); // 粗
    assert.ok((widthsGroup.children[2] as FakeElement).classList.contains('is-on'));
    assert.ok(!(widthsGroup.children[1] as FakeElement).classList.contains('is-on'));
    (colorsGroup.children[5] as FakeElement).click(); // 朱红
    assert.ok((colorsGroup.children[5] as FakeElement).classList.contains('is-on'));
    assert.ok(!(colorsGroup.children[0] as FakeElement).classList.contains('is-on'));

    // 画一笔 → 撤销 → 清空 → 撤销
    firePointer(canvas, 'pointerdown', pointerEv(10, 10));
    firePointer(canvas, 'pointermove', pointerEv(30, 10));
    firePointer(canvas, 'pointerup', pointerEv(30, 10));
    assert.equal(api.getStrokeCount(), 1);
    (actionsGroup.children[0] as FakeElement).click(); // 撤销
    assert.equal(api.getStrokeCount(), 0);
    firePointer(canvas, 'pointerdown', pointerEv(10, 10));
    firePointer(canvas, 'pointerup', pointerEv(10, 10));
    assert.equal(api.getStrokeCount(), 1);
    (actionsGroup.children[1] as FakeElement).click(); // 清空
    assert.equal(api.getStrokeCount(), 0);
    (actionsGroup.children[0] as FakeElement).click(); // 撤销清空
    assert.equal(api.getStrokeCount(), 1);

    // 完成 → 收起
    (actionsGroup.children[2] as FakeElement).click();
    assert.equal(api.isActive(), false);
    assert.ok(!rootEl.classList.contains('is-active'));
    assert.equal(toolbar.hidden, true);
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    assert.equal((canvas.style as FakeStyle).pointerEvents, 'none');
    await drainAsyncWork();
  });
});

test('P5B: dispose releases ui controls and host bindings; repeated dispose is safe', async () => {
  await withFakeGlobals(async (doc, host) => {
    const { attachBoardNotes } = await import(pathToFileURL(NOTES_PATH).href);
    const board = {
      containerObj: host,
      attr: { pan: { enabled: true }, zoom: { wheel: true } },
      origin: { scrCoords: [1, 0, 0] },
      unitX: 1,
      unitY: 1,
      on() {},
      off() {},
    };
    const api = attachBoardNotes(board, { host, storageKey: '' });
    const rootEl = host.children[0] as FakeElement;
    const dock = host.children[1] as FakeElement;
    const chrome = dock.children[0] as FakeElement;
    const toggle = chrome.children[1] as FakeElement;

    toggle.click(); // 激活
    assert.equal(api.isActive(), true);

    api.dispose();
    // host 绑定标记清除，允许二次 mount 重建
    assert.equal(host.dataset.mathNotesBound, undefined);
    assert.equal((host as unknown as { _mathNotesCtrl?: unknown })._mathNotesCtrl, undefined);
    // 按钮点击监听已由 createButton.dispose 移除：再点不会重新激活
    assert.equal(api.isActive(), false);
    assert.ok(!rootEl.classList.contains('is-active'));
    toggle.click();
    assert.equal(api.isActive(), false, 'dispose 后按钮点击不得复活控制器');
    // dispose 幂等
    api.dispose();
    await drainAsyncWork();
  });
});
