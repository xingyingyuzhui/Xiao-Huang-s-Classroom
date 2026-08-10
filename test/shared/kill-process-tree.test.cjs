/**
 * killProcessTree 注入契约：默认走真实杀树；memory 实现绝不得触碰 process.kill。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

let killLib;
let processKillCalls = 0;
const originalProcessKill = process.kill.bind(process);

test.before(async () => {
  process.kill = (...args) => {
    processKillCalls += 1;
    return originalProcessKill(...args);
  };
  killLib = await import(pathToFileURL(path.join(root, 'scripts/lib/kill-process-tree.mjs')).href);
});

test.after(() => {
  process.kill = originalProcessKill;
});

test('memoryKillProcessTree 只调 child.kill，不触碰 process.kill', () => {
  processKillCalls = 0;
  const killCalls = [];
  killLib.memoryKillProcessTree({
    pid: 424242,
    kill(sig) {
      killCalls.push(sig);
    },
  });
  assert.deepEqual(killCalls, ['SIGTERM']);
  assert.equal(processKillCalls, 0);
});

test('killProcessTree 可通过 killPg 注入验证 POSIX 路径，不碰真实 process.kill', () => {
  processKillCalls = 0;
  const pg = [];
  killLib.killProcessTree(
    { pid: 424243 },
    {
      platform: 'linux',
      killPg: (pid, signal) => pg.push([pid, signal]),
    },
  );
  assert.deepEqual(pg, [[424243, 'SIGTERM']]);
  assert.equal(processKillCalls, 0);
});

test('killProcessTree win32 走 taskkill 注入，不碰真实 process.kill', () => {
  processKillCalls = 0;
  const tasks = [];
  killLib.killProcessTree(
    { pid: 424244 },
    {
      platform: 'win32',
      taskkill: (pid) => tasks.push(pid),
    },
  );
  assert.deepEqual(tasks, [424244]);
  assert.equal(processKillCalls, 0);
});
