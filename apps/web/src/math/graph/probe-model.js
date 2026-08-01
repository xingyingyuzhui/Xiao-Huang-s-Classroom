/**
 * 曲线探针：沿 x 读取可见函数的坐标与有效性（纯逻辑，可单测）。
 *
 * 规则：活动函数优先，其次按列表顺序；最多采样 maxFunctions 条；
 * 隐藏函数跳过；定义域外 / Infinity / NaN 标 invalid。
 */

/** @param {number} value @param {number} [maxDecimals] */
export function formatProbeValue(value, maxDecimals = 2) {
  if (!Number.isFinite(value)) return '—';
  const f = Number(value.toFixed(maxDecimals));
  return Object.is(f, -0) ? '0' : String(f);
}

/**
 * @param {{
 *   functions: any[],
 *   pointerX: number,
 *   activeFunctionId: string | null,
 *   evaluator: (fn: any, x: number) => number | null,
 *   labelFor?: (fn: any) => string,
 *   options?: { maxFunctions?: number },
 * }} params
 * @returns {Array<{ functionId: string, x: number, y: number | null, valid: boolean, label: string }>}
 */
export function sampleProbe(params) {
  const {
    functions = [],
    pointerX,
    activeFunctionId = null,
    evaluator,
    labelFor = (fn) => fn.name || fn.id || '函数',
    options = {},
  } = params;
  const maxFunctions = Number.isInteger(options.maxFunctions) ? options.maxFunctions : 10;
  if (!Number.isFinite(pointerX) || typeof evaluator !== 'function') return [];

  const visible = (functions || []).filter((fn) => fn?.visible);
  const ordered = [...visible].sort((a, b) => {
    const aActive = a.id === activeFunctionId ? 0 : 1;
    const bActive = b.id === activeFunctionId ? 0 : 1;
    return aActive - bActive;
  });

  const samples = [];
  for (const fn of ordered.slice(0, maxFunctions)) {
    let y = null;
    let valid = false;
    try {
      y = evaluator(fn, pointerX);
      valid = y != null && Number.isFinite(y);
    } catch {
      valid = false;
    }
    samples.push({
      functionId: fn.id,
      x: pointerX,
      y: valid ? y : null,
      valid,
      label: labelFor(fn),
    });
  }
  return samples;
}

/**
 * 键盘步长：按当前刻度；Shift 用 0.1 倍细步。
 * @param {number} tick
 * @param {boolean} shift
 */
export function probeStepFromTick(tick, shift) {
  const base = Number.isFinite(tick) && tick > 0 ? tick : 1;
  return shift ? base * 0.1 : base;
}
