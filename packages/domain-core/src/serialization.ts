/** serializable clone / normalize helpers（spec §7.2）。 */

/** 深拷贝并丢弃函数/undefined/NaN/Infinity（只保留可序列化值）。 */
export function serializableClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value
      .filter(
        (v) =>
          v !== undefined &&
          typeof v !== 'function' &&
          !(typeof v === 'number' && !Number.isFinite(v)),
      )
      .map((v) => serializableClone(v)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined || typeof v === 'function') continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    out[k] = serializableClone(v);
  }
  return out as T;
}

/** 数值规范化：字符串转数字、非有限数返回 null。 */
export function normalizeFinite(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
