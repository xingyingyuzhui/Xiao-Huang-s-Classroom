/**
 * 终止 child 所在进程树（POSIX 进程组 / Windows taskkill /T）。
 * 供 dev-server / dev-all supervisor 注入；测试必须注入内存实现，禁止默认走真实 process.kill。
 */
import { spawn } from 'node:child_process';

/**
 * @param {import('node:child_process').ChildProcess | { pid?: number, kill?: Function }} child
 * @param {{
 *   platform?: NodeJS.Platform,
 *   killPg?: (pid: number, signal: NodeJS.Signals) => void,
 *   killSelf?: (child: any, signal: NodeJS.Signals) => void,
 *   taskkill?: (pid: number) => void,
 * }} [opts]
 */
export function killProcessTree(child, opts = {}) {
  if (!child || child.pid == null) return;
  const platform = opts.platform || process.platform;
  const killPg =
    opts.killPg ||
    ((pid, signal) => {
      process.kill(-pid, signal);
    });
  const killSelf =
    opts.killSelf ||
    ((c, signal) => {
      c.kill?.(signal);
    });
  const taskkill =
    opts.taskkill ||
    ((pid) => {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        detached: true,
      });
    });

  try {
    if (platform === 'win32') {
      taskkill(Number(child.pid));
    } else {
      killPg(Number(child.pid), 'SIGTERM');
    }
  } catch {
    try {
      killSelf(child, 'SIGTERM');
    } catch {
      /* 已退出 */
    }
  }
}

/** 测试用：只调用 child.kill，绝不触碰真实 process.kill / 进程组。 */
export function memoryKillProcessTree(child) {
  if (!child) return;
  try {
    child.kill?.('SIGTERM');
  } catch {
    /* 已退出 */
  }
}
