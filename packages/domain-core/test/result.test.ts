import { describe, expect, it } from 'vitest';
import { ok, err, isOk, isErr } from '../src/result.js';
import type { Result } from '../src/result.js';

describe('Result<T, E>', () => {
  it('ok/err 构造与判定', () => {
    expect(isOk(ok(42))).toBe(true);
    expect(isErr(err('boom'))).toBe(true);
    expect(isErr(ok(1))).toBe(false);
  });

  it('map 只作用于 ok', () => {
    const mapped = ok(2).map((x) => x * 10);
    expect(mapped.ok).toBe(true);
    if (mapped.ok) expect(mapped.value).toBe(20);
    const e = err<string>('x');
    const mappedErr = e.map((v) => v + 1);
    expect(mappedErr.ok).toBe(false);
    if (!mappedErr.ok) expect(mappedErr.error).toBe('x');
  });

  it('unwrap 返回值或抛出错误', () => {
    expect(ok(1).unwrap()).toBe(1);
    expect(() => err('x').unwrap()).toThrow();
  });

  it('ok/err 可匹配 discriminated union', () => {
    const r: Result<number, string> = ok(7);
    if (r.ok) expect(r.value).toBe(7);
    else expect.unreachable();
  });
});
