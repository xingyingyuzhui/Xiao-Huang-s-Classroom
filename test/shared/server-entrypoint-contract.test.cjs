/**
 * Server 干净 start/dev 合同（2026-08-10 主计划 Task 7）：
 * - prestart/predev 经 Turbo 构建 @xiaohuang/server 及其依赖（不绕过依赖图）；
 * - start 单一入口 node src/index.js（不依赖第二套 dist 路径）；
 * - dev 由 scripts/dev-server.mjs supervisor 持有（tsup watch + JS chokidar + 重启状态机）；
 * - 根 dev:server 委托 workspace；根 dev:all 由跨平台 supervisor 持有（无 shell &）；
 * - verify-server-start 的端口解析与进程树终止为可单测纯函数。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

function readPkg(relativeDir) {
  return JSON.parse(fs.readFileSync(path.join(root, relativeDir, 'package.json'), 'utf8'));
}

test('server prestart/predev 经 Turbo 构建 @xiaohuang/server 及其依赖', () => {
  const pkg = readPkg('apps/server');
  for (const script of ['prestart', 'predev']) {
    assert.equal(typeof pkg.scripts[script], 'string', `apps/server 必须有 ${script} 脚本`);
    assert.match(
      pkg.scripts[script],
      /turbo run build --filter=@xiaohuang\/server\.\.\./,
      `${script} 必须走 Turbo filter @xiaohuang/server...（含 domain-core/math-expr/subject-settings）`,
    );
    assert.doesNotMatch(
      pkg.scripts[script],
      /npm run build -w @xiaohuang\/server/,
      `${script} 不得绕过 Turbo 依赖图只构建自身`,
    );
  }
});

test('server start 单一产物入口：node src/index.js，无第二套 dist 路径', () => {
  const pkg = readPkg('apps/server');
  assert.equal(pkg.scripts.start, 'node src/index.js');
  assert.doesNotMatch(pkg.scripts.start, /dist/, 'start 不依赖第二套 dist 路径');
});

test('server dev 由 dev-server.mjs supervisor 持有（tsup watch + Server 重启状态机）', () => {
  const pkg = readPkg('apps/server');
  assert.equal(pkg.scripts.dev, 'node ../../scripts/dev-server.mjs');
  const script = fs.readFileSync(path.join(root, 'scripts/dev-server.mjs'), 'utf8');
  assert.match(script, /tsup/, 'supervisor 持有 compiler（tsup）');
  assert.match(script, /--watch/, 'compiler 以 tsup --watch 运行');
  assert.match(script, /chokidar/, 'JS 组合根由 chokidar 监听');
  assert.match(script, /apps\/server\/src/, '监听明确 src 源码集合');
  assert.doesNotMatch(script, /[^&]&\s*(npm|node|tsup|npx|vite)\b/, 'supervisor 不使用 shell & 后台命令');
  assert.doesNotMatch(script, /&[ \t]*$/, 'supervisor 无行尾 &');
});

test('根 dev:server 委托 workspace；根 dev:all 由 dev-all supervisor 持有（无 shell &）', () => {
  const pkg = readPkg('.');
  assert.equal(pkg.scripts['dev:server'], 'npm run dev -w @xiaohuang/server');
  assert.equal(pkg.scripts['dev:all'], 'node scripts/dev-all.mjs');
  const devAll = fs.readFileSync(path.join(root, 'scripts/dev-all.mjs'), 'utf8');
  assert.match(devAll, /taskkill|process\.kill|\.kill\(/, 'dev-all 具备整树终止');
  assert.doesNotMatch(devAll, /[^&]&\s*(npm|node|tsup|npx|vite)\b/, 'dev-all 不使用 shell & 后台命令');
  assert.doesNotMatch(devAll, /&[ \t]*$/, 'dev-all 无行尾 &');
});

test('verify-server-start：监听端口解析纯函数（真实端口取自日志）', async () => {
  const mod = await import(
    pathToFileURL(path.join(root, 'scripts/verify-server-start.mjs')).href
  );
  const { parseListenPort } = mod;
  assert.deepEqual(parseListenPort('监听: 127.0.0.1:3001'), { host: '127.0.0.1', port: 3001 });
  assert.deepEqual(parseListenPort('监听: 0.0.0.0:3100'), { host: '0.0.0.0', port: 3100 });
  assert.equal(parseListenPort('任意普通日志行'), null);
  assert.equal(parseListenPort(''), null);
});

test('verify-server-start：进程树终止目标纯函数（POSIX group / Windows taskkill /T）', async () => {
  const mod = await import(
    pathToFileURL(path.join(root, 'scripts/verify-server-start.mjs')).href
  );
  const { computeKillTarget } = mod;
  for (const platform of ['linux', 'darwin']) {
    assert.deepEqual(computeKillTarget(1234, platform), { pid: -1234, signal: 'SIGTERM' });
  }
  assert.deepEqual(computeKillTarget(1234, 'win32'), {
    pid: 1234,
    args: ['/PID', '1234', '/T', '/F'],
  });
  assert.throws(() => computeKillTarget('abc', 'linux'), /pid/, '非法 pid 必须报错');
});
