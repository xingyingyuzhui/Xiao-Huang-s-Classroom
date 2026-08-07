import { describe, expect, it } from 'vitest';
import { createDisposer, disposeAll } from '../src/cancellation.js';
import type { Disposable } from '../src/cancellation.js';

describe('disposable 合同', () => {
  it('createDisposer 幂等且只执行一次', () => {
    let n = 0;
    const d = createDisposer(() => {
      n += 1;
    });
    d.dispose();
    d.dispose();
    expect(n).toBe(1);
  });

  it('disposeAll 逆序执行且单个失败不阻断其余', () => {
    const order: string[] = [];
    const list: Disposable[] = [
      { dispose: () => order.push('a') },
      {
        dispose: () => {
          order.push('b');
          throw new Error('b exploded');
        },
      },
      { dispose: () => order.push('c') },
    ];
    disposeAll(list);
    expect(order).toEqual(['c', 'b', 'a']);
  });
});
