/**
 * 曲线探针控制器：transient 十字线/读数，不写文档、不进历史、不触发自动保存。
 *
 * - pointer move 用 requestAnimationFrame 合并；
 * - 左右方向键按刻度步长移动，Shift 用 0.1 倍细步；
 * - 读数写入 aria-live="polite" 区域。
 */

import { formatProbeValue, probeStepFromTick, sampleProbe } from './probe-model.js';

/**
 * @param {{
 *   board: any,
 *   getFunctions: () => any[],
 *   getActiveFunctionId: () => string | null,
 *   resolveEvaluator: (fn: any) => ((x: number) => number | null) | null,
 *   labelFor?: (fn: any) => string,
 *   getTick: () => number,
 *   onSample?: (samples: any[], pointerX: number | null) => void,
 *   readoutEl?: { textContent: string, setAttribute?: (name: string, value: string) => void, hidden?: boolean } | null,
 *   eventTarget?: any,
 *   frameScheduler?: (fn: () => void) => any,
 * }} options
 */
export function createProbeController(options) {
  const {
    board,
    getFunctions,
    getActiveFunctionId,
    resolveEvaluator,
    labelFor,
    getTick,
    onSample,
    readoutEl,
    eventTarget,
  } = options;
  const scheduleFrame =
    typeof options.frameScheduler === 'function'
      ? options.frameScheduler
      : (fn) => requestAnimationFrame(fn);
  const host = board?.containerObj;
  /** @type {any[]} */
  const transient = [];
  /** @type {number | null} */
  let frame = null;
  /** @type {number | null} */
  let pointerX = null;
  let active = false;

  /** @param {number | null} x */
  function clearTransient() {
    for (const el of transient) {
      try {
        board.removeObject(el);
      } catch {
        /* */
      }
    }
    transient.length = 0;
  }

  /** @param {number} x @returns {any[]} */
  function samplesAt(x) {
    return sampleProbe({
      functions: getFunctions(),
      pointerX: x,
      activeFunctionId: getActiveFunctionId(),
      evaluator: (fn, value) => {
        const resolve = resolveEvaluator(fn);
        return typeof resolve === 'function' ? resolve(value) : null;
      },
      labelFor,
    });
  }

  /** @param {number} x @param {any[]} samples */
  function renderReadout(x, samples) {
    if (readoutEl) {
      const parts = samples
        .filter((s) => s.valid)
        .map((s) => `${s.label}：x=${formatProbeValue(s.x)}，y=${formatProbeValue(s.y)}`);
      readoutEl.textContent = parts.length ? parts.join('；') : '曲线外';
      readoutEl.hidden = !parts.length;
    }
    onSample?.(samples, x);
  }

  /**
   * 更新 transient 十字线与读数（RAF 合并）。
   * @param {number} x
   */
  function updateAt(x) {
    if (!active) return;
    pointerX = x;
    if (frame != null) return;
    frame = scheduleFrame(() => {
      frame = null;
      if (!active || pointerX == null) return;
      drawCrosshair(pointerX);
      renderReadout(pointerX, samplesAt(pointerX));
    });
  }

  /** @param {number | null} x */
  function drawCrosshair(x) {
    clearTransient();
    if (x == null || !Number.isFinite(x)) return;
    let bb = null;
    try {
      bb = board.getBoundingBox?.();
    } catch {
      bb = null;
    }
    if (!bb || bb.length < 4) return;
    const [, yMax, , yMin] = bb;
    try {
      transient.push(
        board.create('line', [[x, yMin], [x, yMax]], {
          strokeColor: '#8a8aaa',
          strokeWidth: 1,
          dash: 2,
          fixed: true,
          withLabel: false,
          highlight: false,
        }),
      );
    } catch {
      /* best-effort crosshair */
    }
  }

  /** @param {KeyboardEvent} event */
  function onKeyDown(event) {
    if (!active) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const step = probeStepFromTick(getTick(), event.shiftKey);
      const next = (pointerX ?? 0) + (event.key === 'ArrowRight' ? step : -step);
      updateAt(next);
      return;
    }
    if (event.key === 'Escape') {
      deactivate();
    }
  }

  /** @param {PointerEvent | MouseEvent} event */
  function onPointerMove(event) {
    if (!active) return;
    let coords = null;
    try {
      coords = board.getUsrCoordsOfMouse?.(event);
    } catch {
      coords = null;
    }
    if (!coords) return;
    const x = coords[0] === 1 ? coords[1] : coords[0];
    if (Number.isFinite(x)) updateAt(x);
  }

  function activate() {
    if (active) return;
    active = true;
    host?.addEventListener?.('pointermove', onPointerMove);
  }

  function deactivate() {
    active = false;
    frame = null;
    host?.removeEventListener?.('pointermove', onPointerMove);
    clearTransient();
    pointerX = null;
    if (readoutEl) {
      readoutEl.textContent = '';
      readoutEl.hidden = true;
    }
    onSample?.([], null);
  }

  function dispose() {
    deactivate();
    eventTarget?.removeEventListener?.('keydown', onKeyDown);
  }

  function isActive() {
    return active;
  }

  eventTarget?.addEventListener?.('keydown', onKeyDown);

  return { activate, deactivate, dispose, isActive, updateAt };
}
