/** cancellation 与 disposable 合同（spec §7.2）。 */

export interface Disposable {
  dispose(): void;
}

/** 幂等 disposer：只执行一次；重复 dispose 不重复副作用。 */
export function createDisposer(fn: () => void): Disposable {
  let called = false;
  return {
    dispose() {
      if (called) return;
      called = true;
      fn();
    },
  };
}

/** 逆序释放；单个失败不阻断其余；错误汇总返回（不静默）。 */
export function disposeAll(list: readonly Disposable[]): unknown[] {
  const errors: unknown[] = [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    try {
      list[i]?.dispose();
    } catch (err) {
      errors.push(err);
    }
  }
  return errors;
}
