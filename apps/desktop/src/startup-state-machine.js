/**
 * Electron 启动状态机（Program 6 Task 6.2；spec §12.2）。
 *
 * idle → staging → serverStarting → ready → closing → closed
 *                      └→ failed
 * 要求：并发启动幂等；readiness 用健康检查（不靠固定延时）；
 * 启动失败提供可诊断错误，不留下后台进程。
 */
const STATES = ['idle', 'staging', 'serverStarting', 'ready', 'closing', 'closed', 'failed'];

function createStartupStateMachine() {
  let state = 'idle';
  /** @type {string | null} */
  let failureReason = null;
  const listeners = new Set();

  function transition(next) {
    if (!STATES.includes(next)) throw new Error(`未知状态: ${next}`);
    state = next;
    for (const fn of listeners) fn(state);
  }

  return {
    getState: () => state,
    getFailureReason: () => failureReason,
    /** 并发启动幂等：ready/closing 时重复 start 直接返回当前状态 */
    start() {
      if (state === 'idle' || state === 'failed' || state === 'closed') {
        failureReason = null;
        transition('staging');
        return true;
      }
      return false;
    },
    serverStarting() {
      if (state !== 'staging') return false;
      transition('serverStarting');
      return true;
    },
    /** 健康检查通过后进入 ready */
    ready() {
      if (state !== 'serverStarting') return false;
      transition('ready');
      return true;
    },
    fail(reason) {
      if (state === 'closing' || state === 'closed') return false;
      failureReason = String(reason ?? '未知原因');
      transition('failed');
      return true;
    },
    closing() {
      if (state !== 'ready' && state !== 'failed') return false;
      transition('closing');
      return true;
    },
    /** 关闭完成（等待 DB/Server 清理后） */
    closed() {
      if (state !== 'closing') return false;
      transition('closed');
      return true;
    },
    /** failed 后允许重新启动 */
    canRestart() {
      return state === 'failed' || state === 'closed';
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

module.exports = { createStartupStateMachine, STATES };
