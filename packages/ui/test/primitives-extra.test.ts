import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeDocument, type FakeElement } from '@xiaohuang/test-kit';
import { createInput, createSelect, createSlider, createTooltip, createProgress } from '../src/index.js';

let doc: ReturnType<typeof createFakeDocument>;
beforeEach(() => {
  doc = createFakeDocument();
  globalThis.document = {
    createElement: (tag: string) => doc.createElement(tag),
    getElementById: (id: string) => doc.getElementById(id),
  } as unknown as Document;
});

describe('primitives-extra', () => {
  it('input: value 同步与 change 事件', () => {
    let last = '';
    const input = createInput({ value: 'a', onChange: (v) => { last = v; } });
    input.update({ value: 'b' });
    const fakeEl = input.element as unknown as FakeElement;
    for (const fn of fakeEl.listeners.input || []) fn();
    expect(last).toBe('b');
    input.dispose();
  });

  it('select: 选项渲染与 value', () => {
    const sel = createSelect({ options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], value: 'b' });
    const fakeEl = sel.element as unknown as FakeElement;
    expect(fakeEl.children.length).toBe(2);
    sel.dispose();
  });

  it('slider: min/max/step 与输入事件', () => {
    const changed: number[] = [];
    const slider = createSlider({ value: 5, min: 0, max: 10, step: 1, onChange: (v) => changed.push(v) });
    slider.update({ value: 8 });
    const fakeEl = slider.element as unknown as FakeElement;
    for (const fn of fakeEl.listeners.input || []) fn();
    expect(changed.at(-1)).toBe(8);
    slider.dispose();
  });

  it('tooltip: visible 状态与安全文本', () => {
    const tip = createTooltip({ text: '<b>x</b>', visible: false });
    expect(tip.element.hidden).toBe(true);
    tip.update({ visible: true });
    expect(tip.element.hidden).toBe(false);
    expect(tip.element.textContent).toBe('<b>x</b>');
    expect(tip.element.innerHTML).toBe('');
    tip.dispose();
  });

  it('progress: value/max', () => {
    const p = createProgress({ value: 40, max: 100 });
    const fakeEl = p.element as unknown as FakeElement;
    expect(fakeEl.value).toBe(40);
    p.dispose();
  });
});
