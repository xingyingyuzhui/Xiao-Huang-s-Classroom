/**
 * 参数播放控制器：起点/终点由用户捕获，播放期间插值只存在 transient，
 * 结束时一次 commit 终点；停止/取消恢复起点。
 *
 * - 注入 { requestFrame, cancelFrame, reducedMotion } 可测；
 * - duration 限制 200–5000ms；后台 Tab / dispose 取消 frame；
 * - reduced-motion 直接应用终点并 commit。
 */

import { interpolateCoeffs } from './transform-model.js';

const MIN_DURATION = 200;
const MAX_DURATION = 5000;

/**
 * @param {{
 *   requestFrame: (fn: (t: number) => void) => any,
 *   cancelFrame: (id: any) => void,
 *   documentTarget?: { visibilityState?: string, addEventListener?: (type: string, fn: any) => void, removeEventListener?: (type: string, fn: any) => void },
 *   reducedMotion?: boolean,
 *   now?: () => number,
 * }} options
 */
export function createTransformController(options) {
  const {
    requestFrame,
    cancelFrame,
    documentTarget,
    reducedMotion = false,
    now = () => performance.now(),
  } = options;
  const target = documentTarget || (typeof document !== 'undefined' ? document : null);

  /** @type {{ preset: string, from: any, to: any, fnId: string, duration: number, onFrame: (coeffs: any) => void, onCommit: (coeffs: any) => void } | null} */
  let session = null;
  /** @type {any} */
  let frameId = null;
  let startTime = 0;
  let disposed = false;

  /** @param {number} value */
  function clampDuration(value) {
    const raw = Number(value) || 1200;
    return Math.min(MAX_DURATION, Math.max(MIN_DURATION, raw));
  }

  function tick(nowMs) {
    if (!session || disposed) return;
    const t = Math.min(1, (nowMs - startTime) / session.duration);
    const coeffs = interpolateCoeffs(session.preset, session.from, session.to, t);
    session.onFrame(coeffs);
    if (t >= 1) {
      frameId = null;
      const done = session;
      session = null;
      done.onCommit(done.to);
      return;
    }
    frameId = requestFrame(tick);
  }

  /**
   * 开始播放；起点=当前函数 coeffs，终点=传入 to。
   * @param {{ fnId: string, preset: string, from: any, to: any, duration?: number, onFrame: (coeffs: any) => void, onCommit: (coeffs: any) => void }} params
   */
  function play(params) {
    if (disposed) return false;
    stop({ restore: false });
    session = {
      preset: params.preset,
      from: params.from,
      to: params.to,
      fnId: params.fnId,
      duration: clampDuration(params.duration),
      onFrame: params.onFrame,
      onCommit: params.onCommit,
    };
    if (reducedMotion) {
      // 减少动态：直接应用终点并 commit
      session.onFrame(session.to);
      const done = session;
      session = null;
      done.onCommit(done.to);
      return true;
    }
    startTime = now();
    frameId = requestFrame(tick);
    return true;
  }

  /**
   * 停止/取消：恢复起点（onFrame 起点 + onCommit 起点），并取消 frame。
   * @param {{ restore?: boolean }} [opts]
   */
  function stop(opts = {}) {
    if (frameId != null) {
      cancelFrame(frameId);
      frameId = null;
    }
    if (!session) return false;
    const done = session;
    session = null;
    if (opts.restore !== false) {
      done.onFrame(done.from);
      done.onCommit(done.from);
    }
    return true;
  }

  function isPlaying() {
    return session != null;
  }

  function onVisibilityChange() {
    if (target?.visibilityState === 'hidden') stop({ restore: true });
  }

  target?.addEventListener?.('visibilitychange', onVisibilityChange);

  function dispose() {
    disposed = true;
    stop({ restore: true });
    target?.removeEventListener?.('visibilitychange', onVisibilityChange);
  }

  return { play, stop, isPlaying, dispose };
}
