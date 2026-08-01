/** 将高频工作合并到下一动画帧，仅保留一个待执行任务。 */

/**
 * @param {() => void} task
 * @param {{ requestFrame?: (callback: FrameRequestCallback) => number, cancelFrame?: (id: number) => void }} [options]
 */
export function createFrameTask(task, options = {}) {
  const requestFrame = options.requestFrame || ((callback) => globalThis.requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame || ((id) => globalThis.cancelAnimationFrame(id));
  /** @type {number | null} */
  let frameId = null;

  return {
    schedule() {
      if (frameId !== null) return;
      frameId = requestFrame(() => {
        frameId = null;
        task();
      });
    },
    cancel() {
      if (frameId === null) return;
      cancelFrame(frameId);
      frameId = null;
    },
    pending() {
      return frameId !== null;
    },
  };
}

