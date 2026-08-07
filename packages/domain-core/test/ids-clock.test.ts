import { describe, expect, it } from 'vitest';
import { createIdAllocator, SystemClock } from '../src/ids-clock.js';

describe('IdAllocator 与 Clock 注入', () => {
  it('IdAllocator 从已占用集合推进且不重复', () => {
    const alloc = createIdAllocator(['f1', 'f2', 'f9']);
    expect(alloc.next('f')).toBe('f10');
    expect(alloc.next('f')).toBe('f11');
    expect(alloc.next('U')).toBe('U1');
  });

  it('SystemClock 返回可排序时间戳', () => {
    const clock = SystemClock;
    const a = clock.now();
    const b = clock.now();
    expect(typeof a).toBe('number');
    expect(b).toBeGreaterThanOrEqual(a);
  });
});
