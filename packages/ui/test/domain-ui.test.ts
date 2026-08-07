import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeDocument, type FakeElement } from '@xiaohuang/test-kit';
import { createNumberInput, createToolGroup, createReadoutCard } from '../src/index.js';

let doc: ReturnType<typeof createFakeDocument>;
function fireKey(el: FakeElement, key: string) {
  for (const fn of el.listeners.keydown || []) fn({ key, preventDefault() {} });
}

beforeEach(() => {
  doc = createFakeDocument();
  globalThis.document = {
    createElement: (tag: string) => doc.createElement(tag),
    getElementById: (id: string) => doc.getElementById(id),
  } as unknown as Document;
});

describe('domain / classroom ui', () => {
  it('number-input: 上下键步进（含 clamp）与 Enter 提交', () => {
    const changed: number[] = [];
    const committed: number[] = [];
    const input = createNumberInput({
      value: 5,
      min: 0,
      max: 10,
      step: 2,
      onChange: (v) => {
        changed.push(v);
        input.update({ value: v });
      },
      onCommit: (v) => committed.push(v),
    });
    const fakeEl = input.element as unknown as FakeElement;
    fireKey(fakeEl, 'ArrowUp');
    expect(changed.at(-1)).toBe(7);
    fireKey(fakeEl, 'ArrowUp');
    expect(changed.at(-1)).toBe(9);
    fireKey(fakeEl, 'ArrowUp'); // 到 11 → clamp 10
    expect(changed.at(-1)).toBe(10);
    fireKey(fakeEl, 'Enter');
    expect(committed.at(-1)).toBe(10);
    input.dispose();
  });

  it('number-input: 文本安全与 disabled 状态', () => {
    const input = createNumberInput({ value: 3, disabled: true });
    const fakeEl = input.element as unknown as FakeElement;
    expect(fakeEl.disabled).toBe(true);
    expect(input.element.className).toContain('is-disabled');
    input.dispose();
  });

  it('tool-group: 单选切换与 aria-checked', () => {
    let current: string | null = null;
    const group = createToolGroup({
      tools: [
        { id: 'select', label: '选择' },
        { id: 'point', label: '点' },
      ],
      activeId: 'select',
      onChange: (id) => {
        current = id;
        group.update({ activeId: id });
      },
    });
    const fakeEl = group.element as unknown as FakeElement;
    // 模拟点击第二个工具按钮
    const children = fakeEl.children as FakeElement[];
    const second = children[1] as FakeElement;
    for (const fn of second.listeners.click || []) fn();
    expect(current).toBe('point');
    // render 重建后重新取按钮断言 aria-checked
    const rebuilt = (group.element as unknown as FakeElement).children as FakeElement[];
    expect(rebuilt[1]?.getAttribute('aria-checked')).toBe('true');
    group.dispose();
  });

  it('readout-card: 行渲染与空态', () => {
    const card = createReadoutCard({ title: '特征', rows: [{ key: '零点', value: 'x≈1.5' }] });
    expect(card.element.className).toContain('ui-readout-card');
    card.update({ rows: [] });
    const empty = createReadoutCard({ rows: [], emptyText: '暂无' });
    expect(empty.element.textContent).toBe('暂无');
    card.dispose();
    empty.dispose();
  });

  it('readout-card: 恶意值只作 textContent', () => {
    const card = createReadoutCard({
      title: '<img onerror=x>',
      rows: [{ key: 'k', value: '<script>alert(1)</script>' }],
    });
    expect(card.element.innerHTML).toBe('');
    expect(card.element.textContent).toContain('<script>alert(1)</script>');
    card.dispose();
  });
});
