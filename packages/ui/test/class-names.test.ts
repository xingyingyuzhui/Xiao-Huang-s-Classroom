import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeDocument, type FakeElement } from '@xiaohuang/test-kit';
import { createButton } from '../src/index.js';

/**
 * className 合并必须按真实 DOM 语义工作：classList.add 只接受单个 token，
 * 含空白的字符串（如业务 Bridge 模式的 'math-fn-btn math-fn-btn-add'）会抛
 * SyntaxError。这里断言每个 token 都作为独立 class 存在。
 */
let doc: ReturnType<typeof createFakeDocument>;
beforeEach(() => {
  doc = createFakeDocument();
  globalThis.document = {
    createElement: (tag: string) => doc.createElement(tag),
    getElementById: (id: string) => doc.getElementById(id),
  } as unknown as Document;
});

describe('ui class-names', () => {
  it('button: 多 token className 逐个加入（真实 DOM classList 语义）', () => {
    const btn = createButton({ label: 'x', className: 'math-fn-btn math-fn-btn-add' });
    for (const token of ['ui-btn', 'math-fn-btn', 'math-fn-btn-add']) {
      expect(btn.element.classList.contains(token)).toBe(true);
    }
    expect(btn.element.className).toBe('ui-btn math-fn-btn math-fn-btn-add');
    btn.dispose();
  });

  it('button: 单 token className 边界', () => {
    const btn = createButton({ label: 'x', className: 'solo' });
    expect(btn.element.classList.contains('solo')).toBe(true);
    expect(btn.element.className).toBe('ui-btn solo');
    btn.dispose();
  });

  it('button: 空 className 不添加任何 token', () => {
    const btn = createButton({ label: 'x', className: '' });
    expect(btn.element.className).toBe('ui-btn');
    expect((btn.element as unknown as FakeElement).classList.classes.size).toBe(1);
    btn.dispose();
  });

  it('button: 纯空白 className 安全跳过', () => {
    const btn = createButton({ label: 'x', className: '   \t  ' });
    expect(btn.element.className).toBe('ui-btn');
    expect((btn.element as unknown as FakeElement).classList.classes.size).toBe(1);
    btn.dispose();
  });

  it('button: 混合空白分隔与重复 token', () => {
    const btn = createButton({ label: 'x', className: 'a  b\tc\nb' });
    for (const token of ['ui-btn', 'a', 'b', 'c']) {
      expect(btn.element.classList.contains(token)).toBe(true);
    }
    // 重复 token 不重复占位（Set 语义）
    expect(btn.element.className).toBe('ui-btn a b c');
    btn.dispose();
  });
});
