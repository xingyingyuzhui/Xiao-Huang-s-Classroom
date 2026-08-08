/**
 * Electron 启动状态机合同（Program 6 Task 6.2）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const { createStartupStateMachine, STATES } = require(
  path.join(root, 'apps/desktop/src/startup-state-machine.js'),
);

test('状态机覆盖 spec §12.2 全部状态', () => {
  assert.deepEqual(STATES, [
    'idle',
    'staging',
    'serverStarting',
    'ready',
    'closing',
    'closed',
    'failed',
  ]);
});

test('正常路径 idle → staging → serverStarting → ready → closing → closed', () => {
  const m = createStartupStateMachine();
  const seen = [];
  m.subscribe((s) => seen.push(s));
  assert.equal(m.start(), true);
  assert.equal(m.serverStarting(), true);
  assert.equal(m.ready(), true);
  assert.equal(m.closing(), true);
  assert.equal(m.closed(), true);
  assert.deepEqual(seen, ['staging', 'serverStarting', 'ready', 'closing', 'closed']);
});

test('并发启动幂等：ready 后重复 start 不重入', () => {
  const m = createStartupStateMachine();
  m.start();
  m.serverStarting();
  m.ready();
  assert.equal(m.start(), false, 'ready 后重复 start 幂等拒绝');
});

test('失败路径：serverStarting → failed，保留可诊断原因，可重启', () => {
  const m = createStartupStateMachine();
  m.start();
  m.serverStarting();
  assert.equal(m.fail('EADDRINUSE: 端口被占用'), true);
  assert.equal(m.getState(), 'failed');
  assert.equal(m.getFailureReason(), 'EADDRINUSE: 端口被占用');
  assert.equal(m.canRestart(), true);
  // 重启
  assert.equal(m.start(), true);
  assert.equal(m.getFailureReason(), null, '重启清空失败原因');
});

test('非法迁移拒绝：ready 前不能 closing；closed 后不能 fail', () => {
  const m = createStartupStateMachine();
  assert.equal(m.closing(), false, 'ready 前不能 closing');
  m.start();
  m.serverStarting();
  m.ready();
  m.closing();
  m.closed();
  assert.equal(m.fail('x'), false, 'closed 后不能 fail');
});
