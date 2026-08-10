#!/usr/bin/env node
/**
 * Server dev supervisor（2026-08-10 主计划 Task 7）。
 *
 * 统一持有 compiler child（tsup --watch）与 server child（node src/index.js）：
 * - 首轮 watcher 完整构建成功后才启动首个 Server（不把旧 dist 当成本轮成功）；
 * - 后续只在「一轮完整构建成功」事件后 debounce 切换 Server child；
 * - TS 构建失败保留上一版可运行 Server，禁止启动半成品；
 * - 组合根与未进入 tsup bundle 的 JS 变化（chokidar）触发一次 debounce 重启；
 * - 重启先停旧 child、确认退出后再启动新 child（禁止双 Server 同时监听）；
 * - SIGINT/SIGTERM、compiler 意外退出时回收两个 child；
 * - 不使用 shell &；child 以独立进程组启动（Windows 用 taskkill /T 兜底）。
 *
 * 核心状态机以 createDevServerSupervisor 导出（fake child 可单测），
 * 直接执行本文件时以真实 tsup/node 子进程运行。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chokidar from 'chokidar';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ROOT = path.join(ROOT, 'apps/server');
const TSUP_CLI = path.join(ROOT, 'node_modules', 'tsup', 'dist', 'cli-default.js');

/** CJS 产物构建成功（每轮 rebuild 都输出；DTS 不影响运行时，不作为事件） */
const SUCCESS_RE = /CJS\s+[^\n]*Build success/;
/** tsup 失败事件（语法/打包错误） */
const FAILURE_RE = /\bBuild failed\b|:\s*ERROR:/;
/** tsup watch 就绪 = 首轮 CJS 构建完成（每轮 rebuild 不重复输出） */
const ARMED_RE = /Watching for changes/;
/** server 实际监听日志（apps/server/src/index.js） */
const READY_RE = /监听:\s*(\S+):(\d+)/;

function isMain() {
  return (
    process.argv[1] != null && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  );
}

function spawnDetached(file, args, cwd) {
  return spawn(file, args, {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    // POSIX 独立进程组：终止时 kill(-pid) 可回收整树
    detached: process.platform !== 'win32',
  });
}

/**
 * 创建 dev supervisor（可注入 fake child 测试状态机）。
 * @param {object} [options]
 * @param {() => import('node:child_process').ChildProcess} [options.spawnCompiler]
 * @param {() => import('node:child_process').ChildProcess} [options.spawnServer]
 * @param {(onChange: () => void) => { close: () => Promise<void> }} [options.watch]
 * @param {Console} [options.logger]
 * @param {number} [options.debounceMs]
 * @param {import('node:events').EventEmitter} [options.signals] CLI 传 process，测试传 fake
 */
export function createDevServerSupervisor({
  spawnCompiler = () => spawnDetached(process.execPath, [TSUP_CLI, '--watch'], SERVER_ROOT),
  spawnServer = () => spawnDetached(process.execPath, ['src/index.js'], SERVER_ROOT),
  watch = (onChange) => {
    const w = chokidar.watch(path.join(SERVER_ROOT, 'src', '**', '*.js'), {
      ignoreInitial: true,
      ignored: /(^|[\\/])(dist|data|public|node_modules)([\\/]|$)/,
    });
    w.on('change', onChange);
    w.on('add', onChange);
    return { close: () => w.close() };
  },
  logger = console,
  debounceMs = 300,
  signals = null,
}) {
  const state = {
    compiler: null,
    server: null,
    firstBuildConfirmed: false, // watcher 首轮完整构建成功已确认（armed）
    serverUp: false, // 有可用的 server child
    startingServer: false, // server child 已 spawn，等 READY/exit
    restartPending: false, // debounce 计时中
    restartInProgress: false, // 停旧→启新进行中
    rebuildDirty: false, // 重启期间又来了成功事件
    shuttingDown: false,
    restartTimer: null,
    killFallbackTimers: new Set(),
  };
  const log = (msg) => logger.log(`[dev-server] ${msg}`);
  const err = (msg) => logger.error(`[dev-server] ${msg}`);

  function forward(child, tag) {
    child.stdout?.on('data', (chunk) => {
      const text = String(chunk);
      processLine(text, tag);
      logger.log(text.replace(/\n$/, ''));
    });
    child.stderr?.on('data', (chunk) => {
      const text = String(chunk);
      processLine(text, tag);
      logger.error(text.replace(/\n$/, ''));
    });
  }

  function processLine(text, tag) {
    if (tag === 'compiler') {
      if (ARMED_RE.test(text)) onArmed();
      if (SUCCESS_RE.test(text)) onBuildSuccess();
      if (FAILURE_RE.test(text)) onBuildFailure();
    }
  }

  /** watch 就绪 = 首轮完整 CJS 构建成功（tsup 明确输出），此时才启动首个 Server */
  function onArmed() {
    if (state.shuttingDown || state.firstBuildConfirmed) return;
    state.firstBuildConfirmed = true;
    log('watcher 首轮构建成功（Watching for changes），启动首个 Server');
    startServer();
  }

  function onBuildFailure() {
    if (state.shuttingDown || state.restartInProgress) return;
    if (!state.serverUp) {
      err('构建失败：保留上一版产物，不启动新 Server');
    } else {
      err('构建失败：保留当前运行的 Server（不上半成品）');
    }
  }

  function onBuildSuccess() {
    if (state.shuttingDown) return;
    if (state.startingServer || state.restartInProgress) {
      state.rebuildDirty = true;
      return;
    }
    if (!state.firstBuildConfirmed) return; // armed 前的首轮 CJS 成功不算事件
    scheduleRestart('build');
  }

  function scheduleRestart(reason) {
    if (state.shuttingDown || state.restartPending || state.restartInProgress) return;
    state.restartPending = true;
    log(`收到 ${reason} 事件，${debounceMs}ms 后重启 Server`);
    state.restartTimer = setTimeout(() => {
      state.restartPending = false;
      doRestart(reason);
    }, debounceMs);
  }

  function killChild(child) {
    if (!child || child.exitCode != null || child.signalCode) return;
    child.__intentional = true;
    try {
      if (process.platform === 'win32') {
        spawnDetached('taskkill', ['/PID', String(child.pid), '/T', '/F'], ROOT);
      } else {
        process.kill(-child.pid, 'SIGTERM');
      }
    } catch {
      try {
        child.kill('SIGTERM');
      } catch {
        /* 已退出 */
      }
    }
    // 兜底：5s 未退出则 SIGKILL
    const timer = setTimeout(() => {
      state.killFallbackTimers.delete(timer);
      if (child.exitCode == null && !child.signalCode) {
        try {
          child.kill('SIGKILL');
        } catch {
          /* 已退出 */
        }
      }
    }, 5000);
    state.killFallbackTimers.add(timer);
  }

  function startServer() {
    if (state.shuttingDown) return;
    state.startingServer = true;
    const child = spawnServer();
    state.server = child;
    forward(child, 'server');
    child.on('exit', (code, signal) => {
      if (child.__intentional || state.shuttingDown) return;
      state.startingServer = false;
      const wasUp = state.serverUp;
      state.serverUp = false;
      if (!wasUp) {
        err(`Server 启动失败（exit ${code ?? signal}）——等待下一次成功构建再启动`);
      } else {
        err(`Server 意外退出（exit ${code ?? signal}）——等待下一次成功构建再重启`);
      }
      if (state.restartInProgress) {
        state.restartInProgress = false;
        finishRestartCleanup();
      }
    });
    child.stdout?.on('data', (chunk) => {
      if (READY_RE.test(String(chunk)) && !state.serverUp && !child.__intentional) {
        state.serverUp = true;
        state.startingServer = false;
        const restarting = state.restartInProgress;
        state.restartInProgress = false;
        log('Server 已监听' + (restarting ? '（重启完成）' : ''));
        if (state.rebuildDirty) {
          state.rebuildDirty = false;
          scheduleRestart('build-during-restart');
        }
      }
    });
  }

  function finishRestartCleanup() {
    // 停旧后新 server 未成功启动：无可用 server，等待下一次构建事件
  }

  function doRestart(reason) {
    if (state.shuttingDown || state.restartInProgress) return;
    log(`重启 Server（${reason}）`);
    state.restartInProgress = true;
    if (state.serverUp || state.startingServer) {
      const old = state.server;
      state.serverUp = false;
      state.startingServer = false;
      killChild(old);
      if (old && old.exitCode == null && !old.signalCode) {
        old.once('exit', () => startServer());
        return;
      }
    }
    startServer();
  }

  function shutdown(code = 0) {
    if (state.shuttingDown) return;
    state.shuttingDown = true;
    if (state.restartTimer) clearTimeout(state.restartTimer);
    if (state.watcher) {
      state.watcher.close().catch(() => {});
    }
    if (state.compiler) killChild(state.compiler);
    if (state.server) killChild(state.server);
    for (const t of state.killFallbackTimers) clearTimeout(t);
    state.killFallbackTimers.clear();
    log('已回收 compiler 与 server child');
    return code;
  }

  return {
    start() {
      state.watcher = watch(() => scheduleRestart('js-change'));
      const compiler = spawnCompiler();
      state.compiler = compiler;
      forward(compiler, 'compiler');
      compiler.on('exit', (code, signal) => {
        if (compiler.__intentional || state.shuttingDown) return;
        err(`compiler 意外退出（exit ${code ?? signal}），回收 Server 后退出`);
        shutdown(1);
      });
      if (signals) {
        signals.on('SIGINT', () => shutdown(0));
        signals.on('SIGTERM', () => shutdown(0));
      }
      log(`compiler 已启动（tsup --watch）`);
    },
    shutdown,
    getState: () => state,
  };
}

if (isMain()) {
  const supervisor = createDevServerSupervisor({ signals: process, logger: console });
  supervisor.start();
  process.on('uncaughtException', (e) => {
    console.error('[dev-server] 未捕获异常:', e);
    supervisor.shutdown(1);
    process.exit(1);
  });
}
