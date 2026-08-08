/**
 * P2 组件合同硬化（计划 2026-08-08-ui-library-adoption-plan §7）：
 * - P2.1 dispose 与泄漏：每个工厂 create → update → dispose 后再次触发不调 handler；
 *   dispose 可重复调用安全；监听器无残留。
 * - P2.2 a11y 基线：button(dialog/input/select/toast) 语义属性。
 * 环境：node + test-kit fake DOM（组件用 document.createElement，鸭子类型满足）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeDocument, type FakeElement } from '@xiaohuang/test-kit';
import {
  createButton,
  createCheckbox,
  createIcon,
  createDialog,
  createToast,
  createTabs,
  createStack,
  createStatus,
  createNumberInput,
  createToolGroup,
  createReadoutCard,
  createInput,
  createSelect,
  createSlider,
  createTooltip,
  createProgress,
} from '../src/index.js';

let doc: ReturnType<typeof createFakeDocument>;
/** fake DOM 无 focus 实现——测试注入并记录焦点归还 */
const focusCalls: FakeElement[] = [];

function fireKey(el: FakeElement, key: string): void {
  for (const fn of el.listeners.keydown || []) fn({ key, preventDefault() {} });
}

function windowKeydown(key: string): void {
  const wl = (doc as unknown as { windowListeners: Record<string, Array<(ev: KeyboardEvent) => void>> })
    .windowListeners ?? {};
  for (const fn of wl.keydown || []) fn({ key, preventDefault() {} } as KeyboardEvent);
}

beforeEach(() => {
  doc = createFakeDocument();
  focusCalls.length = 0;
  globalThis.document = {
    createElement: (tag: string) => {
      const el = doc.createElement(tag) as FakeElement & { focus?: () => void };
      el.focus = () => {
        focusCalls.push(el);
      };
      return el;
    },
    getElementById: (id: string) => doc.getElementById(id),
    addEventListener: (type: string, fn: unknown) => {
      const wl = (doc as unknown as { windowListeners: Record<string, unknown[]> }).windowListeners ??= {};
      (wl[type] = wl[type] || []).push(fn);
    },
    removeEventListener: (type: string, fn: unknown) => {
      const wl = (doc as unknown as { windowListeners: Record<string, unknown[]> }).windowListeners ?? {};
      wl[type] = (wl[type] || []).filter((f) => f !== fn);
    },
  } as unknown as Document;
});

/* ---------------------------------- P2.1 dispose 与泄漏 ---------------------------------- */

describe('P2.1 dispose：create → update → dispose → 触发不调 handler', () => {
  it('button: dispose 后 click 不触发 onClick/on(click)；listener 无残留；dispose 幂等', () => {
    let clicks = 0;
    let seen = 0;
    const btn = createButton({
      label: 'x',
      onClick: () => {
        clicks += 1;
      },
    });
    btn.on('click', () => {
      seen += 1;
    });
    btn.update({ label: 'y', kind: 'danger' });
    btn.dispose();
    btn.element.click();
    expect(clicks).toBe(0);
    expect(seen).toBe(0);
    expect((btn.element as unknown as FakeElement).listenersOf('click')).toBe(0);
    btn.dispose(); // 幂等
  });

  it('checkbox: dispose 后 change 不触发 handler；listener 无残留；dispose 幂等', () => {
    let seen = 0;
    const cb = createCheckbox({ checked: true });
    cb.on('change', () => {
      seen += 1;
    });
    cb.update({ checked: false });
    cb.dispose();
    for (const fn of (cb.element as unknown as FakeElement).listeners.change || []) fn();
    expect(seen).toBe(0);
    expect((cb.element as unknown as FakeElement).listenersOf('change')).toBe(0);
    cb.dispose();
  });

  it('dialog: dispose 后 Esc 不触发 onClose/on(close)；document keydown 解绑；dispose 幂等', () => {
    let closed = 0;
    let seen = 0;
    const dlg = createDialog({
      open: true,
      title: 't',
      onClose: () => {
        closed += 1;
      },
    });
    dlg.on('close', () => {
      seen += 1;
    });
    dlg.update({ title: 't2' });
    dlg.dispose();
    windowKeydown('Escape');
    expect(closed).toBe(0);
    expect(seen).toBe(0);
    dlg.dispose();
  });

  it('toast: dispose 后 timer 不触发 dismiss；dispose 幂等', async () => {
    let dismissed = 0;
    const t = createToast({
      message: 'x',
      durationMs: 10,
      onDismiss: () => {
        dismissed += 1;
      },
    });
    t.update({ message: 'y' });
    t.dispose();
    t.dispose();
    await new Promise((r) => setTimeout(r, 30));
    expect(dismissed).toBe(0);
  });

  it('tabs: dispose 后点击 tab 不触发 on(change)；按钮 click listener 无残留；dispose 幂等', () => {
    let seen: string | null = null;
    const tabs = createTabs({
      tabs: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      activeId: 'a',
    });
    tabs.on('change', (id) => {
      seen = id as string;
    });
    tabs.update({ activeId: 'b' });
    const fakeTabs = tabs.element as unknown as FakeElement;
    const first = fakeTabs.children[0] as FakeElement;
    tabs.dispose();
    for (const fn of first.listeners.click || []) fn();
    expect(seen).toBeNull();
    expect(first.listenersOf('click')).toBe(0);
    tabs.dispose();
  });

  it('number-input: dispose 后 input/keydown 不触发 on(change)；listener 无残留；dispose 幂等', () => {
    let seen: number | null = null;
    const input = createNumberInput({ value: 1, min: 0, max: 9 });
    input.on('change', (v) => {
      seen = v as number;
    });
    input.update({ value: 2 });
    input.dispose();
    const fakeEl = input.element as unknown as FakeElement;
    for (const fn of fakeEl.listeners.input || []) fn();
    fireKey(fakeEl, 'ArrowUp');
    expect(seen).toBeNull();
    expect(fakeEl.listenersOf('input')).toBe(0);
    expect(fakeEl.listenersOf('keydown')).toBe(0);
    input.dispose();
  });

  it('tool-group: dispose 后点击工具不触发 on(change)；按钮 click listener 无残留；dispose 幂等', () => {
    let seen: string | null = null;
    const group = createToolGroup({
      tools: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      activeId: 'a',
    });
    group.on('change', (id) => {
      seen = id as string;
    });
    group.update({ activeId: 'b' });
    const fakeEl = group.element as unknown as FakeElement;
    const second = fakeEl.children[1] as FakeElement;
    group.dispose();
    for (const fn of second.listeners.click || []) fn();
    expect(seen).toBeNull();
    expect(second.listenersOf('click')).toBe(0);
    group.dispose();
  });

  it('input: dispose 后 input 不触发 on(change)；listener 无残留；dispose 幂等', () => {
    let seen: string | null = null;
    const el = createInput({ value: 'a' });
    el.on('change', (v) => {
      seen = v as string;
    });
    el.update({ value: 'b' });
    el.dispose();
    for (const fn of (el.element as unknown as FakeElement).listeners.input || []) fn();
    expect(seen).toBeNull();
    expect((el.element as unknown as FakeElement).listenersOf('input')).toBe(0);
    el.dispose();
  });

  it('select: dispose 后 change 不触发 on(change)；listener 无残留；dispose 幂等', () => {
    let seen: string | null = null;
    const sel = createSelect({ options: [{ value: 'a', label: 'A' }], value: 'a' });
    sel.on('change', (v) => {
      seen = v as string;
    });
    sel.update({ value: 'a' });
    sel.dispose();
    for (const fn of (sel.element as unknown as FakeElement).listeners.change || []) fn();
    expect(seen).toBeNull();
    expect((sel.element as unknown as FakeElement).listenersOf('change')).toBe(0);
    sel.dispose();
  });

  it('slider: dispose 后 input 不触发 on(change)；listener 无残留；dispose 幂等', () => {
    let seen: number | null = null;
    const slider = createSlider({ value: 5, min: 0, max: 10 });
    slider.on('change', (v) => {
      seen = v as number;
    });
    slider.update({ value: 6 });
    slider.dispose();
    for (const fn of (slider.element as unknown as FakeElement).listeners.input || []) fn();
    expect(seen).toBeNull();
    expect((slider.element as unknown as FakeElement).listenersOf('input')).toBe(0);
    slider.dispose();
  });
});

describe('P2.1 dispose：无事件组件 幂等 + update 后再 dispose 安全', () => {
  it('icon', () => {
    const c = createIcon({ name: 'plus' });
    c.update({ name: 'minus' });
    c.dispose();
    c.dispose();
  });

  it('stack', () => {
    const c = createStack({ direction: 'row', gap: 'lg' });
    c.update({ direction: 'column' });
    c.dispose();
    c.dispose();
  });

  it('status', () => {
    const c = createStatus({ kind: 'loading', message: 'm' });
    c.update({ kind: 'error', message: 'e' });
    c.dispose();
    c.dispose();
  });

  it('tooltip', () => {
    const c = createTooltip({ text: 't', visible: true });
    c.update({ visible: false });
    c.dispose();
    c.dispose();
  });

  it('progress', () => {
    const c = createProgress({ value: 40, max: 100 });
    c.update({ value: 80 });
    c.dispose();
    c.dispose();
  });

  it('readout-card', () => {
    const c = createReadoutCard({ title: 't', rows: [{ key: 'k', value: 'v' }] });
    c.update({ rows: [] });
    c.dispose();
    c.dispose();
  });
});

/* ---------------------------------- P2.2 a11y 基线 ---------------------------------- */

describe('P2.2 a11y 基线', () => {
  it('button: type=button；disabled → aria-disabled；loading → aria-busy；update 撤销', () => {
    const btn = createButton({ label: 'x' });
    expect((btn.element as unknown as { type?: string }).type).toBe('button');
    btn.update({ disabled: true });
    expect(btn.element.getAttribute('aria-disabled')).toBe('true');
    expect(btn.element.getAttribute('disabled')).toBe('');
    btn.update({ disabled: false });
    expect(btn.element.getAttribute('aria-disabled')).toBeNull();
    btn.update({ loading: true });
    expect(btn.element.getAttribute('aria-busy')).toBe('true');
    btn.update({ loading: false });
    expect(btn.element.getAttribute('aria-busy')).toBeNull();
    btn.dispose();
  });

  it('dialog: role=dialog + aria-modal；aria-labelledby 关联 title；Esc 关闭；焦点归还 opener', () => {
    const opener = document.createElement('button') as unknown as FakeElement;
    let closed = 0;
    const dlg = createDialog({
      title: '确认',
      open: false,
      opener: opener as unknown as HTMLElement,
      onClose: () => {
        closed += 1;
      },
    });
    expect(dlg.element.getAttribute('role')).toBe('dialog');
    expect(dlg.element.getAttribute('aria-modal')).toBe('true');
    dlg.update({ open: true });
    const titleId = dlg.element.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    const titleEl = (dlg.element as unknown as FakeElement).children[0] as FakeElement;
    expect(titleEl.id).toBe(titleId);
    windowKeydown('Escape');
    expect(closed).toBe(1);
    expect(focusCalls).toContain(opener);
    dlg.dispose();
  });

  it('input/select/checkbox/slider/number-input: aria-label 透传与 update 更新', () => {
    const input = createInput({ value: 'a', 'aria-label': '函数名' });
    expect(input.element.getAttribute('aria-label')).toBe('函数名');
    input.update({ 'aria-label': '参数名' });
    expect(input.element.getAttribute('aria-label')).toBe('参数名');
    input.dispose();

    const sel = createSelect({ 'aria-label': '颜色' });
    expect(sel.element.getAttribute('aria-label')).toBe('颜色');
    sel.update({ 'aria-label': '线型' });
    expect(sel.element.getAttribute('aria-label')).toBe('线型');
    sel.dispose();

    const cb = createCheckbox({ 'aria-label': '显示坐标' });
    expect(cb.element.getAttribute('aria-label')).toBe('显示坐标');
    cb.update({ 'aria-label': '显示网格' });
    expect(cb.element.getAttribute('aria-label')).toBe('显示网格');
    cb.dispose();

    const slider = createSlider({ 'aria-label': '亮度' });
    expect(slider.element.getAttribute('aria-label')).toBe('亮度');
    slider.update({ 'aria-label': '对比度' });
    expect(slider.element.getAttribute('aria-label')).toBe('对比度');
    slider.dispose();

    const num = createNumberInput({ 'aria-label': '系数' });
    expect(num.element.getAttribute('aria-label')).toBe('系数');
    num.update({ 'aria-label': '次数' });
    expect(num.element.getAttribute('aria-label')).toBe('次数');
    num.dispose();
  });

  it('toast: 默认 role=status；error → role=alert；回退 status', () => {
    const t = createToast({ message: '已保存', kind: 'success' });
    expect(t.element.getAttribute('role')).toBe('status');
    t.update({ kind: 'error' });
    expect(t.element.getAttribute('role')).toBe('alert');
    t.update({ kind: 'info' });
    expect(t.element.getAttribute('role')).toBe('status');
    t.dispose();
  });
});
