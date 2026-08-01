/**
 * 函数求值 sidecar：记录只保存持久字段，编译与缓存收敛到这里。
 *
 * 记录变更（编辑 expr / coeffs）后，key 签名变化即自动重编译；
 * id 不变但定义相同则命中缓存，避免重复解析。
 */

import { compileMathExpr } from '../shared/expr-safe.js';
import { evalPreset } from './model.js';

/**
 * @param {any} record
 * @returns {{ ok: true, fn: (x: number) => number | null } | { ok: false, error: string }}
 */
export function compileFunctionRecord(record) {
  if (record?.kind === 'custom') {
    const compiled = compileMathExpr(record.expr || '');
    if (!compiled.ok) {
      return { ok: false, error: compiled.error };
    }
    return { ok: true, fn: compiled.fn };
  }
  if (record?.kind === 'preset' && record.preset) {
    const preset = record.preset;
    const coeffs = record.coeffs || {};
    return {
      ok: true,
      fn: (x) => evalPreset(preset, coeffs, x),
    };
  }
  return { ok: false, error: '未知函数类型' };
}

/**
 * 定义签名：id 之外的数学定义指纹。id 相同但签名变化 = 记录被编辑。
 * @param {any} record
 */
export function evaluatorSignature(record) {
  if (record?.kind === 'custom') return `custom:${record.expr}`;
  if (record?.kind === 'preset') {
    const c = record.coeffs || {};
    return `preset:${record.preset}:${c.a}:${c.b}:${c.c}`;
  }
  return 'unknown';
}

/**
 * @param {{ compile?: (record: any) => any }} [options]
 */
export function createFunctionEvaluatorCache(options = {}) {
  const compile = options.compile || compileFunctionRecord;
  /** @type {Map<string, { sig: string, fn: (x: number) => number | null }>} */
  const entries = new Map();

  return {
    /**
     * @param {any} record
     * @returns {((x: number) => number | null) | null}
     */
    resolve(record) {
      if (!record || typeof record.id !== 'string') return null;
      const sig = evaluatorSignature(record);
      const existing = entries.get(record.id);
      if (existing && existing.sig === sig) return existing.fn;
      const compiled = compile(record);
      if (!compiled.ok) return null;
      entries.set(record.id, { sig, fn: compiled.fn });
      return compiled.fn;
    },
    /** @param {string} id */
    invalidate(id) {
      entries.delete(id);
    },
    clear() {
      entries.clear();
    },
  };
}
