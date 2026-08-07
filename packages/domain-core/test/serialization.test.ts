import { describe, expect, it } from 'vitest';
import { serializableClone, normalizeFinite } from '../src/serialization.js';

describe('serialization helpers', () => {
  it('serializableClone 深拷贝且只保留可序列化值', () => {
    const src = { a: 1, b: [1, 2], c: { d: 3 }, f: () => 1, u: undefined, n: NaN };
    const out = serializableClone(src);
    expect(out).toEqual({ a: 1, b: [1, 2], c: { d: 3 } });
    expect(out).not.toBe(src);
  });

  it('normalizeFinite 拒绝非有限数', () => {
    expect(normalizeFinite(1.5)).toBe(1.5);
    expect(normalizeFinite(NaN)).toBe(null);
    expect(normalizeFinite(Infinity)).toBe(null);
    expect(normalizeFinite('3')).toBe(3);
  });
});
