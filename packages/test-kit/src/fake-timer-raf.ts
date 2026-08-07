/**
 * Fake Timer/RAF：手动推进的时钟与帧调度（从 graph mount 测试经验提炼）。
 */
export interface FakeTimerHandle {
  id: number;
  fn: () => void;
  ms: number;
}

export interface FakeRafHandle {
  id: number;
  fn: () => void;
}

export interface FakeTimers {
  timers: FakeTimerHandle[];
  rafs: FakeRafHandle[];
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
  requestAnimationFrame(fn: () => void): number;
  cancelAnimationFrame(id: number): void;
  /** 推进所有到期 timer（按注册序） */
  runTimers(): void;
  /** 执行下一帧回调 */
  runFrame(): void;
  pendingTimers(): number;
  pendingFrames(): number;
}

export function createFakeTimers(): FakeTimers {
  const timers: FakeTimerHandle[] = [];
  const rafs: FakeRafHandle[] = [];
  let timerSeq = 1;
  let rafSeq = 1;

  return {
    timers,
    rafs,
    setTimeout(fn, ms) {
      const id = timerSeq++;
      timers.push({ id, fn, ms });
      return id;
    },
    clearTimeout(id) {
      const idx = timers.findIndex((t) => t.id === id);
      if (idx >= 0) timers.splice(idx, 1);
    },
    requestAnimationFrame(fn) {
      const id = rafSeq++;
      rafs.push({ id, fn });
      return id;
    },
    cancelAnimationFrame(id) {
      const idx = rafs.findIndex((r) => r.id === id);
      if (idx >= 0) rafs.splice(idx, 1);
    },
    runTimers() {
      for (const t of [...timers]) {
        const idx = timers.findIndex((x) => x.id === t.id);
        if (idx >= 0) timers.splice(idx, 1);
        t.fn();
      }
    },
    runFrame() {
      const fn = rafs.shift()?.fn;
      fn?.();
    },
    pendingTimers() {
      return timers.length;
    },
    pendingFrames() {
      return rafs.length;
    },
  };
}
