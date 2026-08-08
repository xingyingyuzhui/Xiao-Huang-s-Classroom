import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeDocument, type FakeElement } from '@xiaohuang/test-kit';
import {
  createButton,
  createCheckbox,
  createDialog,
  createIcon,
  createInput,
  createNumberInput,
  createProgress,
  createReadoutCard,
  createSelect,
  createSlider,
  createStack,
  createStatus,
  createTabs,
  createToast,
  createToolGroup,
  createTooltip,
} from '../src/index.js';

/**
 * 根节点 class 契约（P1.2）：与 apps/web/src/shared/styles/_ui-kit.css 的
 * 选择器逐一对齐；className 桥接合并必须空格安全且在 update 后保留。
 */
let doc: ReturnType<typeof createFakeDocument>;
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

describe('ui 根节点 class 与 _ui-kit.css 对齐', () => {
  it('button: ui-btn 根 class + kind/size/状态修饰稳定', () => {
    const btn = createButton({ label: '危险', kind: 'danger', size: 'lg' });
    expect(btn.element.classList.contains('ui-btn')).toBe(true);
    expect(btn.element.classList.contains('is-danger')).toBe(true);
    expect(btn.element.classList.contains('is-lg')).toBe(true);

    btn.update({ kind: 'primary', size: 'sm' });
    expect(btn.element.classList.contains('is-primary')).toBe(true);
    expect(btn.element.classList.contains('is-danger')).toBe(false);
    expect(btn.element.classList.contains('is-sm')).toBe(true);
    expect(btn.element.classList.contains('is-lg')).toBe(false);

    btn.update({ kind: 'ghost' });
    expect(btn.element.classList.contains('is-ghost')).toBe(true);
    btn.update({ kind: 'secondary' });
    expect(btn.element.classList.contains('is-secondary')).toBe(true);

    btn.update({ disabled: true, loading: true });
    expect(btn.element.classList.contains('is-disabled')).toBe(true);
    expect(btn.element.classList.contains('is-loading')).toBe(true);
    btn.dispose();
  });

  it('button: className 桥接合并空格安全，update 后保留自定义类', () => {
    const btn = createButton({ label: '添加', className: 'math-fn-btn math-fn-btn-add' });
    expect(btn.element.classList.contains('ui-btn')).toBe(true);
    // 真实 DOM 的 classList.add('a b') 会按空白拆成两个类；fake DOM 不拆，
    // 故经 className 分词断言（CSS 选择器同样按空白分词）。
    const cls = btn.element.className.split(/\s+/);
    for (const name of ['ui-btn', 'math-fn-btn', 'math-fn-btn-add']) {
      expect(cls).toContain(name);
    }
    btn.update({ label: '添加函数', kind: 'primary' });
    const after = btn.element.className.split(/\s+/);
    expect(after).toContain('math-fn-btn');
    expect(after).toContain('math-fn-btn-add');
    expect(after).toContain('ui-btn');
    expect(after).toContain('is-primary');
    btn.dispose();
  });

  it('表单控件: ui-input/ui-select/ui-slider/ui-checkbox/ui-number-input + is-disabled', () => {
    const input = createInput({ value: 'x', disabled: true });
    expect(input.element.classList.contains('ui-input')).toBe(true);
    expect(input.element.classList.contains('is-disabled')).toBe(true);
    input.dispose();

    const select = createSelect({ options: [{ value: 'a', label: 'A' }], disabled: true });
    expect(select.element.classList.contains('ui-select')).toBe(true);
    expect(select.element.classList.contains('is-disabled')).toBe(true);
    select.dispose();

    const slider = createSlider({ value: 5 });
    expect(slider.element.classList.contains('ui-slider')).toBe(true);
    slider.dispose();

    const checkbox = createCheckbox({ checked: true });
    expect(checkbox.element.classList.contains('ui-checkbox')).toBe(true);
    checkbox.dispose();

    const num = createNumberInput({ value: 1 });
    expect(num.element.classList.contains('ui-number-input')).toBe(true);
    num.dispose();
  });

  it('overlay/layout/feedback: 根 class 稳定', () => {
    const dialog = createDialog({ title: '确认' });
    expect(dialog.element.classList.contains('ui-dialog')).toBe(true);
    dialog.dispose();

    const toast = createToast({ message: 'ok', kind: 'success', durationMs: 0 });
    expect(toast.element.classList.contains('ui-toast')).toBe(true);
    expect(toast.element.classList.contains('is-success')).toBe(true);
    toast.dispose();

    const tabs = createTabs({ tabs: [{ id: 'a', label: 'A' }] });
    expect(tabs.element.classList.contains('ui-tabs')).toBe(true);
    tabs.dispose();

    const stack = createStack({ direction: 'column' });
    expect(stack.element.classList.contains('ui-stack')).toBe(true);
    expect(stack.element.classList.contains('is-column')).toBe(true);
    stack.dispose();

    const group = createToolGroup({ tools: [{ id: 'a', label: 'A' }] });
    expect(group.element.classList.contains('ui-tool-group')).toBe(true);
    group.dispose();

    const card = createReadoutCard({ title: '卡' });
    expect(card.element.classList.contains('ui-readout-card')).toBe(true);
    card.dispose();

    const status = createStatus({ kind: 'error', message: 'x' });
    expect(status.element.classList.contains('ui-status')).toBe(true);
    expect(status.element.classList.contains('is-error')).toBe(true);
    status.dispose();

    const icon = createIcon({ size: 'sm' });
    expect(icon.element.classList.contains('ui-icon')).toBe(true);
    expect(icon.element.classList.contains('is-sm')).toBe(true);
    icon.dispose();

    const tooltip = createTooltip({ text: 'tip' });
    expect(tooltip.element.classList.contains('ui-tooltip')).toBe(true);
    tooltip.dispose();

    const progress = createProgress({ value: 30 });
    expect(progress.element.classList.contains('ui-progress')).toBe(true);
    progress.dispose();
  });

  it('tabs/tool-group: 内部按钮 ui-tab/ui-tool + is-active', () => {
    const tabs = createTabs({
      tabs: [{ id: 'a', label: 'A' }],
      activeId: 'a',
    });
    const tabBtn = ((tabs.element as unknown as FakeElement).children as FakeElement[])[0] as FakeElement;
    expect(tabBtn.className).toContain('ui-tab');
    expect(tabBtn.className).toContain('is-active');
    tabs.dispose();

    const group = createToolGroup({
      tools: [{ id: 'a', label: 'A' }],
      activeId: 'a',
    });
    const toolBtn = ((group.element as unknown as FakeElement).children as FakeElement[])[0] as FakeElement;
    expect(toolBtn.className).toContain('ui-tool');
    expect(toolBtn.className).toContain('is-active');
    group.dispose();
  });
});
