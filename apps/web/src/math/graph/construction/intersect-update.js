/**
 * 交点更新合并：schedule 时立即失效坐标缓存；RAF 只合并副作用。
 */

/** @type {Set<any>} */
const pending = new Set();
/** @type {number} */
let rafId = 0;
/** @type {(cb: FrameRequestCallback) => number} */
let requestFrame =
  typeof globalThis.requestAnimationFrame === 'function'
    ? (cb) => globalThis.requestAnimationFrame(cb)
    : (cb) => globalThis.setTimeout(() => cb(Date.now()), 16);
/** @type {(id: number) => void} */
let cancelFrame =
  typeof globalThis.cancelAnimationFrame === 'function'
    ? (id) => globalThis.cancelAnimationFrame(id)
    : (id) => globalThis.clearTimeout(id);

/**
 * @param {{ requestFrame?: typeof requestFrame, cancelFrame?: typeof cancelFrame }} [opts]
 */
export function configureIntersectUpdateScheduler(opts = {}) {
  if (typeof opts.requestFrame === 'function') requestFrame = opts.requestFrame;
  if (typeof opts.cancelFrame === 'function') cancelFrame = opts.cancelFrame;
}

/** @param {any} point */
export function scheduleIntersectUpdate(point) {
  if (!point) return;
  // 必须在本轮 board.update 之前清缓存，否则 JSXGraph 仍读到旧坐标
  try {
    point._mathIntersectInvalidate?.();
  } catch {
    /* */
  }
  pending.add(point);
  if (rafId) return;
  rafId = requestFrame(() => {
    rafId = 0;
    const batch = [...pending];
    pending.clear();
    for (const pt of batch) {
      if (pt._mathIntersectUpdating) continue;
      pt._mathIntersectUpdating = true;
      try {
        pt._mathIntersectUpdate?.();
      } catch {
        /* disposed */
      } finally {
        pt._mathIntersectUpdating = false;
      }
    }
  });
}

export function flushIntersectUpdates() {
  if (rafId) {
    cancelFrame(rafId);
    rafId = 0;
  }
  const batch = [...pending];
  pending.clear();
  for (const pt of batch) {
    if (pt._mathIntersectUpdating) continue;
    pt._mathIntersectUpdating = true;
    try {
      pt._mathIntersectUpdate?.();
    } catch {
      /* */
    } finally {
      pt._mathIntersectUpdating = false;
    }
  }
}

/** @returns {number} */
export function pendingIntersectUpdateCount() {
  return pending.size;
}

/** 测试/dispose：清空 pending，避免持有 board/runtime */
export function resetIntersectUpdateScheduler() {
  if (rafId) {
    cancelFrame(rafId);
    rafId = 0;
  }
  pending.clear();
}
