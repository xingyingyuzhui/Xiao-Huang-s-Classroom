#!/usr/bin/env node
/**
 * Server 自包含 start/dev health smoke（2026-08-10 主计划 Task 7）。
 *
 * 两种模式都走真实 npm lifecycle（不用 fake supervisor 代替集成 smoke）：
 * - --mode=start：spawn `npm run start -w @xiaohuang/server`（prestart 经 Turbo 构建）；
 * - --mode=dev：spawn `npm run dev:server`（predev 构建 + watcher 首轮成功 + 监听）。
 *
 * 流程：
 * 1. 系统临时数据目录 + 候选空闲端口传入 PORT（被抢占时从 `监听: host:port` 日志解析真实端口）；
 * 2. CHEM_LAB_DATA_DIR=<tmp> / CHEM_LAB_BIND=127.0.0.1 / OPEN_BROWSER=0 / PORT=<candidate>；
 * 3. 轮询真实端口 /api/health（30s 超时），失败输出截断日志；
 * 4. 成功后整树终止（POSIX 独立进程组 kill group；Windows taskkill /T）；
 * 5. 等待端口关闭并再次 health 确认已关闭；finally 清理临时目录；
 * 6. smoke 前后记录 apps/server/data 与 apps/server/src/data 状态（证明无生产数据写入）。
 *
 * 端口解析与进程树终止抽为纯函数（parseListenPort / computeKillTarget），可单测。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEALTH_TIMEOUT_MS = 30_000;
const PORT_CLOSE_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const LOG_TRUNCATE = 4000;

function isMain() {
  return (
    process.argv[1] != null && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  );
}

/** 从 server 日志解析真实监听端口（listenWithRetry 可能 +1 偏移） */
export function parseListenPort(line) {
  const m = /监听:\s*(\S+):(\d+)/.exec(line);
  if (!m) return null;
  return { host: m[1], port: Number(m[2]) };
}

/** 进程树终止目标（纯函数）：POSIX kill group；Windows taskkill /T /F */
export function computeKillTarget(pid, platform = process.platform) {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`非法 pid: ${pid}`);
  if (platform === 'win32') return { pid, args: ['/PID', String(pid), '/T', '/F'] };
  return { pid: -pid, signal: 'SIGTERM' };
}

export function killTree(pid, platform = process.platform) {
  const target = computeKillTarget(pid, platform);
  if (platform === 'win32') {
    const child = spawn('taskkill', target.args, { stdio: 'ignore', detached: true });
    child.unref();
    return;
  }
  try {
    process.kill(target.pid, target.signal);
  } catch {
    /* 已退出 */
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findCandidatePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function fetchHealth(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    if (res.status !== 200) return false;
    const body = await res.json();
    return body.status === 'ok';
  } catch {
    return false;
  }
}

/** 轮询 health 直到成功或超时 */
async function waitForHealth(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fetchHealth(port)) return true;
    await sleep(500);
  }
  return false;
}

/** 轮询端口关闭（connect 被拒视为关闭） */
async function waitForPortClosed(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const open = await new Promise((resolve) => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => {
        s.destroy();
        resolve(true);
      });
      s.once('error', () => resolve(false));
    });
    if (!open) return true;
    await sleep(500);
  }
  return false;
}

/** 快照数据目录状态（apps/server/data 与 src/data），smoke 前后对比 */
export function snapshotDataState() {
  const out = {};
  for (const rel of ['apps/server/data', 'apps/server/src/data']) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      out[rel] = null;
      continue;
    }
    const entries = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else entries.push({ rel: path.relative(abs, full), size: fs.statSync(full).size });
      }
    };
    walk(abs);
    out[rel] = entries.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  }
  return JSON.stringify(out);
}

function truncate(text) {
  if (text.length <= LOG_TRUNCATE) return text;
  return `…（截断前 ${LOG_TRUNCATE} 字符）…\n${text.slice(0, LOG_TRUNCATE)}`;
}

async function waitChildExit(child, timeoutMs) {
  if (child.exitCode != null || child.signalCode) return;
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(timeoutMs)]);
}

/**
 * 执行一次 start/dev smoke。
 * @returns {Promise<{ ok: boolean, port?: number, stdout: string, stderr: string, reason?: string }>}
 */
async function runAttempt(mode, tmpDir) {
  const candidatePort = await findCandidatePort();
  const args = mode === 'dev' ? ['run', 'dev:server'] : ['run', 'start', '-w', '@xiaohuang/server'];
  const env = {
    ...process.env,
    CHEM_LAB_DATA_DIR: tmpDir,
    CHEM_LAB_BIND: '127.0.0.1',
    OPEN_BROWSER: '0',
    PORT: String(candidatePort),
  };
  const child = spawn('npm', args, {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  lastChild = child; // 供 main 终止整树（npm wrapper 的进程组）
  let stdout = '';
  let stderr = '';
  let lineBuf = '';
  let realPort = null;
  let watcherReady = false; // tsup watch 就绪（dev 模式：watcher 首轮构建成功）
  let exited = false;

  const onData = (chunk, isErr) => {
    const text = String(chunk);
    if (isErr) stderr += text;
    else stdout += text;
    lineBuf += text;
    if (lineBuf.includes('\n')) {
      const lines = lineBuf.split('\n');
      lineBuf = lines.pop();
      for (const line of lines) {
        const parsed = parseListenPort(line);
        if (parsed) realPort = parsed.port;
        if (mode === 'dev' && /Watching for changes/.test(line)) watcherReady = true;
      }
    }
  };
  child.stdout.on('data', (c) => onData(c, false));
  child.stderr.on('data', (c) => onData(c, true));
  child.on('exit', (code, signal) => {
    exited = true;
    if (code !== 0) stderr += `\n[npm exit ${code ?? signal}]\n`;
  });

  // dev 模式必须观察到 watcher 首轮构建成功（Watching for changes）；start 模式不要求
  const portWaitMs = mode === 'dev' ? 180_000 : 45_000;
  const portDeadline = Date.now() + portWaitMs;
  while ((!realPort || (mode === 'dev' && !watcherReady)) && !exited) {
    if (Date.now() > portDeadline) break;
    await sleep(200);
  }

  if (exited) {
    return {
      ok: false,
      stdout,
      stderr,
      reason: `进程提前退出（stdout 尾: ${truncate(stdout.slice(-800))}）`,
    };
  }
  if (!realPort) {
    return {
      ok: false,
      stdout,
      stderr,
      reason: `${portWaitMs / 1000}s 内未从日志解析出真实监听端口（候选 ${candidatePort}；stdout 尾: ${truncate(stdout.slice(-800))}）`,
    };
  }
  if (mode === 'dev' && !watcherReady) {
    return {
      ok: false,
      stdout,
      stderr,
      reason: 'dev 模式未观察到 watcher 首轮构建成功（无 Watching for changes 标记）',
    };
  }

  const healthy = await waitForHealth(realPort, HEALTH_TIMEOUT_MS);
  return {
    ok: healthy,
    port: realPort,
    stdout,
    stderr,
    reason: healthy
      ? undefined
      : `health 30s 超时（端口 ${realPort}；stdout 尾: ${truncate(stdout.slice(-800))}）`,
  };
}

async function main() {
  let mode = null;
  for (const arg of process.argv.slice(2)) {
    if (arg === '--mode') continue;
    if (arg.startsWith('--mode=')) mode = arg.slice('--mode='.length);
  }
  if (mode !== 'start' && mode !== 'dev') {
    console.error('用法: node scripts/verify-server-start.mjs --mode=start|dev');
    process.exit(2);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-server-smoke-'));
  const dataBefore = snapshotDataState();
  const attemptLogs = [];

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      console.log(`\n[verify-server-start] --mode=${mode} 第 ${attempt}/${MAX_ATTEMPTS} 次尝试`);
      const result = await runAttempt(mode, tmpDir);
      if (result.ok) {
        console.log(`[verify-server-start] OK：模式=${mode} 真实端口=${result.port} health=200 ok`);
        // 整树终止（npm wrapper 的进程组；dev 模式下 supervisor 的 SIGTERM 处理器连带回收 tsup/server）
        killTree(lastChild.pid);
        await waitChildExit(lastChild, 10_000);
        const closed = await waitForPortClosed(result.port, PORT_CLOSE_TIMEOUT_MS);
        if (!closed) {
          console.error(
            `[verify-server-start] FAIL：端口 ${result.port} 在 ${PORT_CLOSE_TIMEOUT_MS / 1000}s 内未关闭`,
          );
          process.exitCode = 1;
          return;
        }
        const healthAfter = await fetchHealth(result.port);
        if (healthAfter) {
          console.error('[verify-server-start] FAIL：终止后 health 仍可访问（进程树未回收干净）');
          process.exitCode = 1;
          return;
        }
        console.log(`[verify-server-start] 端口 ${result.port} 已关闭，进程树已回收`);
        return;
      }
      attemptLogs.push(result);
      console.error(`[verify-server-start] 第 ${attempt} 次失败：${result.reason}`);
      // 清理本次残留进程
      killTree(lastChild.pid);
      await waitChildExit(lastChild, 10_000);
    }
    console.error(`[verify-server-start] FAIL：连续 ${MAX_ATTEMPTS} 次失败`);
    for (const [i, log] of attemptLogs.entries()) {
      console.error(`--- 第 ${i + 1} 次监听/日志 ---\n${truncate(log.stdout)}`);
      if (log.stderr) console.error(`--- 第 ${i + 1} 次 stderr ---\n${truncate(log.stderr)}`);
    }
    process.exitCode = 1;
  } finally {
    const dataAfter = snapshotDataState();
    if (dataBefore !== dataAfter) {
      console.error(
        '[verify-server-start] FAIL：smoke 前后生产数据目录状态变化（CHEM_LAB_DATA_DIR 未生效？）',
      );
      process.exitCode = 1;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log(`[verify-server-start] 临时数据目录已清理: ${tmpDir}`);
  }
}

let lastChild = null;

if (isMain()) {
  main().catch((e) => {
    console.error('[verify-server-start] 未捕获异常:', e);
    process.exitCode = 1;
  });
}
