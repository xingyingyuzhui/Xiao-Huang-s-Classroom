/** 函数集合的记录工厂；不访问 DOM 或画板。 */

import { compileMathExpr } from '../shared/expr-safe.js';
import { defaultCoeffsFor, GRAPH_PRESETS } from './model.js';

/** @param {unknown} value @param {number} fallback */
function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * 采样区间：自定义定义域覆盖视口/全局函数域。
 * @param {any} fn
 * @param {number} viewportMin
 * @param {number} viewportMax
 * @returns {[number, number]}
 */
export function resolveFunctionSampleRange(fn, viewportMin, viewportMax) {
  let x0 = Number.isFinite(viewportMin) ? viewportMin : -10;
  let x1 = Number.isFinite(viewportMax) ? viewportMax : 10;
  if (fn?.domain?.mode === 'custom') {
    const dMin = Number(fn.domain.min);
    const dMax = Number(fn.domain.max);
    if (Number.isFinite(dMin) && Number.isFinite(dMax)) {
      x0 = dMin;
      x1 = dMax;
    }
  }
  return [Math.min(x0, x1), Math.max(x0, x1)];
}

/**
 * @param {{ id: string, colorSlot?: number, preset?: string | null, coeffs?: any }} options
 */
export function createPresetFunctionRecord(options) {
  const preset = GRAPH_PRESETS.some((item) => item.id === options.preset)
    ? options.preset
    : 'quadratic';
  const defaults = defaultCoeffsFor(preset);
  const coeffs = options.coeffs || {};
  return {
    id: options.id,
    name: options.name || '',
    kind: 'preset',
    preset,
    coeffs: {
      a: finiteOr(coeffs.a, defaults.a),
      b: finiteOr(coeffs.b, defaults.b),
      c: finiteOr(coeffs.c, defaults.c),
    },
    expr: '',
    colorSlot: Math.max(0, Math.floor(Number(options.colorSlot) || 0)),
    explicitColor: null,
    visible: true,
    locked: false,
    domain: { mode: 'viewport' },
  };
}

/**
 * @param {{ id: string, colorSlot?: number, raw: string }} options
 * @returns {{ ok: boolean, record: any | null, error: string }}
 */
export function createCustomFunctionRecord(options) {
  const compiled = compileMathExpr(options.raw);
  if (!compiled.ok) {
    return { ok: false, record: null, error: compiled.error };
  }
  return {
    ok: true,
    error: '',
    record: {
      id: options.id,
      name: options.name || '',
      kind: 'custom',
      preset: null,
      coeffs: { a: 0, b: 0, c: 0 },
      expr: compiled.src,
      colorSlot: Math.max(0, Math.floor(Number(options.colorSlot) || 0)),
      explicitColor: null,
      visible: true,
      locked: false,
      domain: { mode: 'viewport' },
    },
  };
}

/**
 * @param {any} spec
 * @param {{ id: string, colorSlot?: number }} identity
 */
export function createFunctionRecordFromAiSpec(spec, identity) {
  if (!spec || typeof spec !== 'object') {
    return { ok: false, record: null, error: '无效的函数规格' };
  }
  if (spec.kind === 'preset' && spec.preset) {
    if (!GRAPH_PRESETS.some((item) => item.id === spec.preset)) {
      return { ok: false, record: null, error: '不支持的预设函数' };
    }
    return {
      ok: true,
      error: '',
      record: createPresetFunctionRecord({
        ...identity,
        preset: spec.preset,
        coeffs: spec.coeffs,
      }),
    };
  }
  if (spec.kind === 'custom' || spec.expr) {
    return createCustomFunctionRecord({
      ...identity,
      raw: String(spec.expr || ''),
    });
  }
  return { ok: false, record: null, error: '无效的函数规格' };
}

