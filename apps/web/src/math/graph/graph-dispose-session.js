/**
 * 画布 dispose 会话（Task 9 拆分）：disposer 注册表。
 *
 * 合同：注册的 disposer 逆序执行；单个失败不阻断其余；幂等；
 * 错误聚合后可见记录（不 silent catch）。
 * mount-controller 的 disposeGraph 前置收尾与 resetState 留在 controller
 * （依赖其闭包），本模块只负责资源栈本身。
 */
export function createDisposeSession() {
  /** @type {Array<() => void>} */
  const disposers = [];
  let disposed = false;

  function register(disposer) {
    if (typeof disposer === 'function') disposers.push(disposer);
  }

  function disposeAll() {
    if (disposed) return;
    disposed = true;
    const errors = [];
    for (let i = disposers.length - 1; i >= 0; i -= 1) {
      try {
        disposers[i]();
      } catch (err) {
        errors.push(err);
      }
    }
    disposers.length = 0;
    if (errors.length) console.error('[graph] dispose errors:', errors);
  }

  function isDisposed() {
    return disposed;
  }

  return { register, disposeAll, isDisposed };
}
