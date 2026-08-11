/**
 * dev-all supervisor 测试（2026-08-10 主计划 Task 7）。
 *
 * 用 fake child 验证 scripts/dev-all.mjs 的 createDevAll：
 * - 任一 child 失败：保留第一个非零退出码并终止另一棵进程树；
 * - 信号转发：SIGINT/SIGTERM 幂等 shutdown，两棵进程树都被回收；
 * - 无孤儿：所有 child 退出后 supervisor 才 resolve。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

let mod;
let killLib;
let pidCounter = 5000;
/** 测试必须注入；若误走真实 process.kill(-pid) 会误杀本机进程组 */
let processKillCalls = 0;
const originalProcessKill = process.kill.bind(process);

/**
 * fake child：kill → 同步或 setImmediate 后 emitExit（模拟 SIGTERM 退出）
 */
function makeFakeChild(name, { asyncExit = false } = {}) {
  const handlers = { exit: [] };
  const child = {
    name,
    pid: pidCounter++,
    exitCode: null,
    signalCode: null,
    killCalls: [],
    on(ev, fn) {
      handlers[ev].push(fn);
      return child;
    },
    kill(sig) {
      child.killCalls.push(sig);
      const doExit = () => child.emitExit(0, null);
      if (asyncExit) setTimeout(doExit, 0);
      else doExit();
    },
    emitExit(code, signal = null) {
      if (child.exitCode != null) return;
      child.exitCode = code;
      child.signalCode = signal;
      const list = handlers.exit.splice(0);
      for (const fn of list) fn(code, signal);
    },
  };
  return child;
}

function silence() {
  return { log() {}, error() {} };
}

function setup({ asyncExit = false } = {}) {
  const children = {};
  const signals = new EventEmitter();
  const sup = mod.createDevAll({
    spawn: (name) => {
      const c = makeFakeChild(name, { asyncExit });
      children[name] = c;
      return c;
    },
    signals,
    logger: silence(),
    killProcessTree: killLib.memoryKillProcessTree,
  });
  sup.start();
  return { sup, children, signals };
}

test('失败传播：child 非零退出 → 保留首个非零码并终止另一棵树', async () => {
  const { sup, children } = setup();
  children.dev.emitExit(1, null);
  const code = await sup.done;
  assert.equal(code, 1, '保留第一个非零退出码');
  assert.equal(children['dev:server'].killCalls.length, 1, '另一棵树被终止');
  assert.equal(sup.getState().shuttingDown, true);
});

test('成功退出（code 0）同样终止另一棵树并退出 0', async () => {
  const { sup, children } = setup();
  children['dev:server'].emitExit(0, null);
  const code = await sup.done;
  assert.equal(code, 0);
  assert.equal(children.dev.killCalls.length, 1);
});

test('SIGTERM 信号转发：两棵树都回收，重复信号幂等', async () => {
  const beforeKills = processKillCalls;
  const { sup, children, signals } = setup();
  signals.emit('SIGTERM');
  signals.emit('SIGTERM');
  signals.emit('SIGINT');
  assert.equal(children.dev.killCalls.length, 1, 'dev 只回收一次');
  assert.equal(children['dev:server'].killCalls.length, 1, 'dev:server 只回收一次');
  const code = await sup.done;
  assert.equal(code, 0, '信号关闭以 0 退出');
  assert.equal(processKillCalls, beforeKills, '注入内存杀树时不得调用真实 process.kill');
});

test('无孤儿：所有 child 退出后 supervisor 才 resolve（异步退出场景）', async () => {
  const { sup, children, signals } = setup({ asyncExit: true });
  signals.emit('SIGINT');
  let resolved = false;
  sup.done.then(() => {
    resolved = true;
  });
  assert.equal(resolved, false, 'child 尚未退出时不得 resolve');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(resolved, true, '全部 child 退出后 resolve');
  assert.equal(children.dev.killCalls.length, 1);
  assert.equal(children['dev:server'].killCalls.length, 1);
});

test.before(async () => {
  processKillCalls = 0;
  process.kill = (...args) => {
    processKillCalls += 1;
    return originalProcessKill(...args);
  };
  mod = await import(pathToFileURL(path.join(root, 'scripts/dev-all.mjs')).href);
  killLib = await import(pathToFileURL(path.join(root, 'scripts/lib/kill-process-tree.mjs')).href);
});

test.after(() => {
  process.kill = originalProcessKill;
});
