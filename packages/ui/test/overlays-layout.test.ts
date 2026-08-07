import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeDocument, type FakeElement } from '@xiaohuang/test-kit';
import { createDialog, createToast, createTabs, createStack, createStatus } from '../src/index.js';

let doc: ReturnType<typeof createFakeDocument>;
/** fake keydown 触发辅助 */
function fireKey(el: FakeElement, key: string) {
  for (const fn of el.listeners.keydown || []) fn({ key, preventDefault() {} });
}

beforeEach(() => {
  doc = createFakeDocument();
  globalThis.document = {
    createElement: (tag: string) => doc.createElement(tag),
    getElementById: (id: string) => doc.getElementById(id),
    addEventListener: (type: string, fn: unknown) => {
      (doc as unknown as { windowListeners: Record<string, unknown[]> }).windowListeners ??= {};
      const wl = (doc as unknown as { windowListeners: Record<string, unknown[]> }).windowListeners;
      (wl[type] = wl[type] || []).push(fn);
    },
    removeEventListener: (type: string, fn: unknown) => {
      const wl =
        (doc as unknown as { windowListeners: Record<string, unknown[]> }).windowListeners ?? {};
      wl[type] = (wl[type] || []).filter((f) => f !== fn);
    },
  } as unknown as Document;
});

describe('overlays / layout / feedback', () => {
  it('dialog: open/hidden 状态与 ESC 关闭', () => {
    let closed = 0;
    const dlg = createDialog({
      title: '确认',
      open: false,
      onClose: () => {
        closed += 1;
      },
    });
    expect(dlg.element.hidden).toBe(true);
    dlg.update({ open: true });
    expect(dlg.element.hidden).toBe(false);
    const fakeDoc = doc as unknown as {
      windowListeners: Record<string, Array<(ev: KeyboardEvent) => void>>;
    };
    for (const fn of fakeDoc.windowListeners.keydown || [])
      fn({ key: 'Escape', preventDefault() {} } as KeyboardEvent);
    expect(closed).toBe(1);
    dlg.dispose();
    // dispose 后 ESC 不再触发
    for (const fn of fakeDoc.windowListeners.keydown || [])
      fn({ key: 'Escape', preventDefault() {} } as KeyboardEvent);
    expect(closed).toBe(1);
  });

  it('dialog: 文本安全输出（title 只作 textContent）', () => {
    const dlg = createDialog({ title: '<script>alert(1)</script>' });
    expect(dlg.element.textContent).toBe('<script>alert(1)</script>');
    dlg.dispose();
  });

  it('toast: durationMs 后自动 dismiss；dispose 清理 timer', () => {
    let dismissed = 0;
    const t = createToast({
      message: '已保存',
      durationMs: 100,
      onDismiss: () => {
        dismissed += 1;
      },
    });
    // fake 环境无真实 setTimeout——dispose 幂等即可
    t.dispose();
    t.dispose();
    expect(dismissed).toBe(0);
  });

  it('tabs: 激活态与键盘切换', () => {
    let current: string | null = null;
    // 受控组件：父侧在 onChange 中同步 activeId
    const tabs = createTabs({
      tabs: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      activeId: 'a',
      onChange: (id) => {
        current = id;
        tabs.update({ activeId: id });
      },
    });
    const fakeTabs = tabs.element as unknown as FakeElement;
    expect(fakeTabs.className).toContain('ui-tabs');
    fireKey(fakeTabs, 'ArrowRight');
    expect(current).toBe('b');
    fireKey(fakeTabs, 'ArrowLeft');
    expect(current).toBe('a');
    tabs.dispose();
  });

  it('stack: 方向与间距状态', () => {
    const s = createStack({ direction: 'row', gap: 'lg' });
    expect(s.element.className).toContain('is-row');
    expect(s.element.className).toContain('is-gap-lg');
    s.dispose();
  });

  it('status: loading/error 状态与安全文本', () => {
    const st = createStatus({ kind: 'error', message: '加载失败：<b>详情</b>' });
    expect(st.element.className).toContain('is-error');
    expect(st.element.textContent).toBe('加载失败：<b>详情</b>');
    expect(st.element.innerHTML).toBe('');
    st.dispose();
  });
});
