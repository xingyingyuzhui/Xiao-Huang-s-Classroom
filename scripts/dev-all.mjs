#!/usr/bin/env node
/**
 * dev:all 跨平台 supervisor（2026-08-10 主计划 Task 7）。
 *
 * 显式 spawn 根 `dev`（Web vite）与 `dev:server`（Server dev supervisor），
 * 替代非跨平台的 shell `&` 后台：
 * - 任一 child 意外退出：保留第一个非零退出码，终止另一棵完整进程树；
 * - SIGINT/SIGTERM 只执行一次幂等 shutdown；
 * - POSIX 独立 process group 整树回收；Windows 用 taskkill /T；
 * - 所有 child 退出后 supervisor 才退出。
 *
 * 核心逻辑以 createDevAll 导出（fake child 可单测），CLI 直接执行时以真实 npm 进程运行。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { killProcessTree as defaultKillProcessTree } from './lib/kill-process-tree.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function isMain() {
  return (
    process.argv[1] != null && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  );
}

function spawnTree(file, args, cwd) {
  return spawn(file, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
    // POSIX 独立进程组：kill(-pid) 回收整树（npm → sh → node 链）
    detached: process.platform !== 'win32',
  });
}

/**
 * 创建 dev:all supervisor。
 * @param {object} options
 * @param {(name: 'dev' | 'dev:server') => import('node:child_process').ChildProcess} options.spawn
 * @param {import('node:events').EventEmitter} [options.signals] CLI 传 process，测试传 fake
 * @param {Console} [options.logger]
 * @param {(child: any) => void} [options.killProcessTree] 默认真实杀树；测试必须注入内存实现
 */
export function createDevAll({
  spawn: spawnChild,
  signals = null,
  logger = console,
  killProcessTree = defaultKillProcessTree,
}) {
  const children = new Map();
  let shuttingDown = false;
  let firstExitCode = null;
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });

  function killTree(child) {
    if (child.__killed) return;
    child.__killed = true;
    killProcessTree(child);
  }

  function maybeDone() {
    if (shuttingDown && children.size === 0) {
      resolveDone(firstExitCode ?? 0);
    }
  }

  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children.values()) killTree(child);
    maybeDone();
  }

  function track(name, child) {
    children.set(name, child);
    child.on('exit', (code, signal) => {
      if (!child.__killed && code !== 0) {
        logger.error(`[dev-all] ${name} 意外退出（exit ${code ?? signal}）`);
      }
      if (!child.__killed && code !== 0 && firstExitCode == null) {
        firstExitCode = code ?? 1;
      }
      if (children.delete(name)) {
        // 任一 child 退出（成功或失败）→ 终止另一棵树
        if (!shuttingDown) {
          for (const other of children.values()) killTree(other);
          shuttingDown = true;
        }
        maybeDone();
      }
    });
    logger.log(`[dev-all] ${name} 已启动（pid ${child.pid}）`);
  }

  return {
    start() {
      track('dev', spawnChild('dev'));
      track('dev:server', spawnChild('dev:server'));
      if (signals) {
        signals.on('SIGINT', shutdown);
        signals.on('SIGTERM', shutdown);
      }
    },
    shutdown,
    /** 所有 child 退出后 resolve；返回退出码（首个非零，信号关闭为 0） */
    done,
    getState: () => ({
      children: children.size,
      shuttingDown,
      firstExitCode,
    }),
  };
}

if (isMain()) {
  const supervisor = createDevAll({
    spawn: (name) => spawnTree('npm', ['run', name], ROOT),
    signals: process,
    logger: console,
  });
  supervisor.start();
  supervisor.done.then((code) => process.exit(code));
}
