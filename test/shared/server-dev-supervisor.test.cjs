/**
 * dev-server supervisor 状态机测试（2026-08-10 主计划 Task 7）。
 *
 * 用 fake compiler/server child（EventEmitter）驱动 scripts/dev-server.mjs 的
 * createDevServerSupervisor，覆盖：
 * - 首轮 watcher 完整构建成功才启动首个 Server（旧 dist 不算本轮成功）；
 * - 成功重建 debounce 后只重启一次；
 * - 失败构建不重启、保留上一版 Server（且初始失败不启动半成品）；
 * - 连续成功事件 debounce 合并；
 * - 组合根 JS 变化触发一次重启；
 * - SIGTERM 全回收两个 child 且幂等。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

let mod;
let pidCounter = 1000;

/** fake child：kill 后同步 emitExit（模拟 SIGTERM 优雅退出） */
function makeFakeChild(name) {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const handlers = { exit: [] };
  const child = {
    name,
    pid: pidCounter++,
    stdout,
    stderr,
    exitCode: null,
    signalCode: null,
    killCalls: [],
    on(ev, fn) {
      handlers[ev].push({ fn, once: false });
      return child;
    },
    once(ev, fn) {
      handlers[ev].push({ fn, once: true });
      return child;
    },
    kill(sig) {
      child.killCalls.push(sig);
      child.emitExit(0, null);
    },
    emitExit(code, signal = null) {
      if (child.exitCode != null) return;
      child.exitCode = code;
      child.signalCode = signal;
      const list = handlers.exit.splice(0);
      for (const h of list) h.fn(code, signal);
    },
    emitStdout(line) {
      stdout.emit('data', `${line}\n`);
    },
    emitStderr(line) {
      stderr.emit('data', `${line}\n`);
    },
  };
  return child;
}

function silence() {
  return { log() {}, error() {} };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor 超时（${timeoutMs}ms）`);
    }
    await sleep(10);
  }
}

/** 建一个已首轮启动的 supervisor（compiler+server 都在跑） */
async function bootedSupervisor(debounceMs = 30) {
  const spawned = { compilers: [], servers: [] };
  const signals = new EventEmitter();
  const watchers = [];
  let watcherClosed = false;
  const sup = mod.createDevServerSupervisor({
    spawnCompiler: () => {
      const c = makeFakeChild('compiler');
      spawned.compilers.push(c);
      return c;
    },
    spawnServer: () => {
      const c = makeFakeChild('server');
      spawned.servers.push(c);
      return c;
    },
    watch: (onChange) => {
      watchers.push(onChange);
      return {
        close: async () => {
          watcherClosed = true;
        },
      };
    },
    logger: silence(),
    debounceMs,
    signals,
  });
  sup.start();
  const compiler = spawned.compilers[0];
  // 首轮：CJS 成功（armed 前，应被忽略）→ Watching for changes（armed）→ 启动 Server
  compiler.emitStdout('CJS ⚡️ Build success in 15ms');
  compiler.emitStdout('CLI Watching for changes in "."');
  await sleep(10);
  const server = spawned.servers[0];
  server.emitStdout('监听: 127.0.0.1:3000');
  await sleep(10);
  return { sup, spawned, signals, watchers, getWatcherClosed: () => watcherClosed };
}

test('初次启动：watcher 首轮构建成功（armed）后才启动 Server，DTS 成功不触发重启', async () => {
  const { sup, spawned } = await bootedSupervisor();
  assert.equal(spawned.compilers.length, 1, '只 spawn 一个 compiler');
  assert.equal(spawned.servers.length, 1, '只 spawn 一个 server');
  assert.equal(spawned.servers[0].killCalls.length, 0, 'server 未被杀');
  assert.equal(sup.getState().serverUp, true);
  // DTS 成功不影响运行时：不触发重启
  spawned.compilers[0].emitStdout('DTS ⚡️ Build success in 5ms');
  await sleep(60);
  assert.equal(spawned.servers.length, 1, 'DTS 成功不触发重启');
  sup.shutdown();
});

test('初始构建失败不启动半成品 Server；随后成功才启动', async () => {
  const spawned = { compilers: [], servers: [] };
  const sup = mod.createDevServerSupervisor({
    spawnCompiler: () => {
      const c = makeFakeChild('compiler');
      spawned.compilers.push(c);
      return c;
    },
    spawnServer: () => {
      const c = makeFakeChild('server');
      spawned.servers.push(c);
      return c;
    },
    watch: () => ({ close: async () => {} }),
    logger: silence(),
    debounceMs: 20,
  });
  sup.start();
  const compiler = spawned.compilers[0];
  compiler.emitStderr('Error: Build failed with 1 error:'); // 首轮 CJS 失败 → 无 armed
  await sleep(10);
  assert.equal(spawned.servers.length, 0, '初始失败不得启动 Server');
  // 修复后首轮成功 → armed → 启动
  compiler.emitStdout('CJS ⚡️ Build success in 15ms');
  compiler.emitStdout('CLI Watching for changes in "."');
  await sleep(10);
  assert.equal(spawned.servers.length, 1, '修复成功后启动首个 Server');
  sup.shutdown();
});

test('成功重建只重启一次（debounce 合并连续成功事件；DTS 不计事件）', async () => {
  const { sup, spawned } = await bootedSupervisor(25);
  const compiler = spawned.compilers[0];
  // 突发 CJS/DTS 混合成功：应合并为一次重启（DTS 不触发）
  compiler.emitStdout('CJS ⚡️ Build success in 3ms');
  compiler.emitStdout('DTS ⚡️ Build success in 4ms');
  compiler.emitStdout('CJS ⚡️ Build success in 5ms');
  await sleep(120);
  const servers = spawned.servers;
  assert.equal(servers.length, 2, '初始 1 + 重启 1（连续事件只重启一次）');
  assert.equal(servers[0].killCalls.length, 1, '旧 server 只被杀一次');
  // 重启后新 server 监听 → running
  servers[1].emitStdout('监听: 127.0.0.1:3000');
  await sleep(10);
  assert.equal(sup.getState().serverUp, true);
  sup.shutdown();
});

test('失败构建不重启：保留上一版可运行 Server', async () => {
  const { sup, spawned } = await bootedSupervisor(25);
  const compiler = spawned.compilers[0];
  compiler.emitStderr('Error: Build failed with 1 error:');
  await sleep(80);
  assert.equal(spawned.servers.length, 1, '失败不 spawn 新 server');
  assert.equal(spawned.servers[0].killCalls.length, 0, '失败不杀旧 server');
  assert.equal(sup.getState().serverUp, true, '旧 server 保持运行');
  sup.shutdown();
});

test('组合根 JS 变化触发一次 debounce 重启（chokidar 路径）', async () => {
  const { sup, spawned, watchers } = await bootedSupervisor(25);
  assert.equal(watchers.length, 1, 'watcher 已注册');
  watchers[0](); // 模拟 apps/server/src/index.js 变化
  watchers[0](); // 连续两次 → 合并
  await sleep(120);
  assert.equal(spawned.servers.length, 2, 'JS 变化重启一次');
  assert.equal(spawned.servers[0].killCalls.length, 1);
  sup.shutdown();
});

test('SIGTERM 全回收两个 child，且幂等（重复信号不重复杀）', async () => {
  const { spawned, signals, getWatcherClosed } = await bootedSupervisor();
  signals.emit('SIGTERM');
  assert.equal(spawned.compilers[0].killCalls.length, 1, 'compiler 被回收一次');
  assert.equal(spawned.servers[0].killCalls.length, 1, 'server 被回收一次');
  assert.equal(getWatcherClosed(), true, 'watcher 已关闭');
  // 幂等：再次 SIGTERM 不重复杀
  signals.emit('SIGTERM');
  signals.emit('SIGINT');
  assert.equal(spawned.compilers[0].killCalls.length, 1);
  assert.equal(spawned.servers[0].killCalls.length, 1);
});

test('compiler 意外退出时回收 Server', async () => {
  const { sup, spawned } = await bootedSupervisor();
  spawned.compilers[0].emitExit(1, null);
  assert.equal(spawned.servers[0].killCalls.length, 1, 'compiler 退出后回收 server');
  assert.equal(sup.getState().shuttingDown, true);
});

test('重启期间到来的成功事件在重启完成后再次调度（不丢事件）', async () => {
  const { sup, spawned } = await bootedSupervisor(25);
  const compiler = spawned.compilers[0];
  compiler.emitStdout('CJS ⚡️ Build success in 3ms'); // 调度重启
  // 等到第一次重启已开始（新 server 已 spawn、旧 server 已被杀）
  await waitFor(() => spawned.servers.length === 2, 1000);
  assert.equal(spawned.servers[0].killCalls.length, 1, '旧 server 已停');
  compiler.emitStdout('CJS ⚡️ Build success in 3ms'); // 重启期间成功 → dirty
  const servers = spawned.servers;
  servers[1].emitStdout('监听: 127.0.0.1:3000'); // 新 server 就绪
  // dirty 再次调度 → 第二次重启
  await waitFor(() => spawned.servers.length === 3, 1000);
  assert.equal(servers[1].killCalls.length, 1, '第一次重启的新 server 被二次重启替换');
  spawned.servers[2].emitStdout('监听: 127.0.0.1:3000');
  await sleep(10);
  assert.equal(sup.getState().serverUp, true, '第二次重启的新 server 就绪');
  sup.shutdown();
});

test.before(async () => {
  mod = await import(pathToFileURL(path.join(root, 'scripts/dev-server.mjs')).href);
});
