import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeDocument, type FakeElement } from '@xiaohuang/test-kit';
import { createButton, createCheckbox, createIcon } from '../src/index.js';

/** 在 fake DOM 上运行组件（组件用 document.createElement；鸭子类型满足） */
let doc: ReturnType<typeof createFakeDocument>;
beforeEach(() => {
  doc = createFakeDocument();
  globalThis.document = {
    createElement: (tag: string) => doc.createElement(tag),
    getElementById: (id: string) => doc.getElementById(id),
  } as unknown as Document;
});

describe('ui primitives', () => {
  it('button: mount/update/dispose 合同', () => {
    const btn = createButton({ label: '开始', kind: 'primary' });
    expect(btn.element.className).toContain('ui-btn');
    expect(btn.element.className).toContain('is-primary');
    expect(btn.element.textContent).toBe('开始');
    btn.update({ label: '重新开始', disabled: true });
    expect(btn.element.textContent).toBe('重新开始');
    expect(btn.element.getAttribute?.('disabled')).toBe('');
    btn.dispose();
  });

  it('button: 文本安全输出（恶意文本只作 textContent，不产生 HTML）', () => {
    const btn = createButton({ label: '<img src=x onerror=alert(1)>' });
    expect(btn.element.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(btn.element.innerHTML).toBe('');
    btn.dispose();
  });

  it('button: disabled/loading 不触发 onClick', () => {
    let clicks = 0;
    const btn = createButton({
      label: 'x',
      onClick: () => {
        clicks += 1;
      },
    });
    btn.element.click();
    expect(clicks).toBe(1);
    btn.update({ disabled: true });
    btn.element.click();
    expect(clicks).toBe(1);
    btn.update({ disabled: false, loading: true });
    btn.element.click();
    expect(clicks).toBe(1);
    btn.dispose();
  });

  it('button: on(click) 事件订阅与退订', () => {
    const btn = createButton({ label: 'x' });
    let seen = 0;
    const off = btn.on('click', () => {
      seen += 1;
    });
    btn.element.click();
    expect(seen).toBe(1);
    off();
    btn.element.click();
    expect(seen).toBe(1);
    btn.dispose();
  });

  it('checkbox: checked 同步与 change 事件', () => {
    const cb = createCheckbox({ label: '显示坐标' });
    let last: boolean | null = null;
    cb.on('change', (v) => {
      last = v as boolean;
    });
    cb.update({ checked: true });
    const fakeEl = cb.element as unknown as FakeElement;
    expect(fakeEl.checked).toBe(true);
    // fake element 的 change listener 直接触发
    for (const fn of fakeEl.listeners.change || []) fn();
    expect(last).toBe(true);
    cb.dispose();
  });

  it('icon: aria-label 与尺寸状态', () => {
    const icon = createIcon({ name: 'plus', size: 'lg', 'aria-label': '添加' });
    expect(icon.element.className).toContain('ui-icon');
    expect(icon.element.className).toContain('is-lg');
    expect(icon.element.getAttribute('aria-label')).toBe('添加');
    icon.dispose();
  });
});
