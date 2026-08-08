/**
 * 将高频工作合并到下一动画帧，仅保留一个待执行任务（C3：shared 纯逻辑 TS 切片）。
 *
 * 无 DOM 直接依赖：requestFrame/cancelFrame 可注入（测试与自定义环境），
 * 默认回落 globalThis.requestAnimationFrame。消费方保持 import './frame-task.js'
 * 路径（Vite 解析到本 TS 源；Node 测试经 vitest 直接消费 TS）。
 */

export interface FrameTaskOptions {
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
}

export interface FrameTask {
  /** 合并调度：已有待执行帧时忽略，仅保留一个任务。 */
  schedule(): void;
  /** 取消待执行帧（已执行/无待执行时幂等）。 */
  cancel(): void;
  /** 是否有待执行帧。 */
  pending(): boolean;
}

/**
 * @param task 帧回调（同一帧内多次 schedule 只执行一次）
 * @param options 帧调度器注入（默认 globalThis.requestAnimationFrame）
 */
export function createFrameTask(task: () => void, options: FrameTaskOptions = {}): FrameTask {
  const requestFrame =
    options.requestFrame || ((callback: FrameRequestCallback) => globalThis.requestAnimationFrame(callback));
  const cancelFrame =
    options.cancelFrame || ((id: number) => globalThis.cancelAnimationFrame(id));
  let frameId: number | null = null;

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
