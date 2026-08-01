/**
 * 数值分析 runner：取消、缓存与 stale result 防护。
 *
 * - cache key：函数定义 hash + 分析区间 + tolerance profile；
 * - 函数/视口变化时取消旧 request；结果返回时 request id 不匹配则丢弃；
 * - 首版 requestIdleCallback + timeout fallback（无 Worker，除非 benchmark 证明需要）。
 */

import { analyzeNumericFeatures } from './numeric-features.js';

/** @param {any} record @param {number[]} interval @param {number} tolerance */
export function analysisCacheKey(record, interval, tolerance) {
  const definition = record
    ? JSON.stringify({ kind: record.kind, preset: record.preset, expr: record.expr, coeffs: record.coeffs })
    : 'none';
  return `${definition}|${interval[0]},${interval[1]}|${tolerance}`;
}

/**
 * @param {{
 *   requestIdleCallback?: (fn: () => void, opts?: any) => any,
 *   setTimeout?: (fn: () => void, ms: number) => any,
 *   clearTimeout?: (id: any) => void,
 * }} [options]
 */
export function createNumericAnalysisRunner(options = {}) {
  const ric =
    typeof options.requestIdleCallback === 'function'
      ? options.requestIdleCallback
      : typeof requestIdleCallback === 'function'
        ? (fn) => requestIdleCallback(fn, { timeout: 120 })
        : null;
  const setTimer =
    typeof options.setTimeout === 'function'
      ? options.setTimeout
      : (fn) => setTimeout(fn, 0);
  const clearTimer =
    typeof options.clearTimeout === 'function'
      ? options.clearTimeout
      : (id) => clearTimeout(id);

  /** @type {Map<string, any>} */
  const cache = new Map();
  /** @type {Map<string, { id: number, timer: any, ricId: any }>} */
  const pending = new Map();
  let seq = 0;

  /**
   * @param {{
   *   record: any,
   *   interval: [number, number],
   *   tolerance?: number,
   *   resolveEvaluator: (record: any) => ((x: number) => number | null) | null,
   *   onResult: (result: any, meta: { cached: boolean }) => void,
   * }} params
   * @returns {() => void} cancel
   */
  function analyze(params) {
    const { record, interval, resolveEvaluator, onResult } = params;
    const tolerance = Number.isFinite(params.tolerance) ? params.tolerance : 1e-4;
    const key = analysisCacheKey(record, interval, tolerance);

    // 同一 key 正在跑 → 直接等它（不重复调度）
    const existing = pending.get(key);
    if (existing) {
      return () => {};
    }

    const cached = cache.get(key);
    if (cached) {
      onResult(cached, { cached: true });
      return () => {};
    }

    const requestId = ++seq;
    const token = { id: requestId, timer: null, ricId: null };

    const run = () => {
      if (pending.get(key) !== token) return;
      const evaluator = resolveEvaluator(record);
      if (!evaluator) {
        pending.delete(key);
        onResult({ ok: true, result: null, warning: 'NO_EVALUATOR' }, { cached: false });
        return;
      }
      const outcome = analyzeNumericFeatures({
        evaluate: evaluator,
        xMin: interval[0],
        xMax: interval[1],
        tolerance,
      });
      pending.delete(key);
      if (outcome.ok && outcome.result) {
        cache.set(key, outcome.result);
      }
      // stale 防护：请求期间 key 已被新请求取代 → 丢弃
      if (seq === requestId || pending.has(key) === false) {
        onResult(outcome, { cached: false });
      }
    };

    pending.set(key, token);
    if (ric) {
      token.ricId = ric(run);
    } else {
      token.timer = setTimer(run);
    }

    return () => {
      const current = pending.get(key);
      if (current !== token) return;
      if (token.ricId != null && typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(token.ricId);
      }
      if (token.timer != null) clearTimer(token.timer);
      pending.delete(key);
    };
  }

  /** @param {string} key */
  function invalidateKey(key) {
    cache.delete(key);
    const current = pending.get(key);
    if (current) {
      if (current.ricId != null && typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(current.ricId);
      }
      if (current.timer != null) clearTimer(current.timer);
      pending.delete(key);
    }
  }

  function clear() {
    for (const key of [...pending.keys()]) invalidateKey(key);
    cache.clear();
  }

  function stats() {
    return { cacheSize: cache.size, pending: pending.size };
  }

  return { analyze, invalidateKey, clear, stats };
}
