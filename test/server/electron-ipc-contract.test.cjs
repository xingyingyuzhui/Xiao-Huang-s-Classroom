/**
 * Electron IPC 合同（Program 6 Task 6.1）。
 *
 * 断言：IPC channel allowlist 唯一来源是 contracts 包 schema；
 * main 进程不开启 nodeIntegration / contextIsolation 关闭。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

test('IPC channel allowlist 唯一来源是 contracts ipcChannelSchema', async () => {
  const { ipcChannelSchema } = await import(
    pathToFileURL(path.join(root, 'packages/contracts/dist/index.js')).href
  );
  const channels = ipcChannelSchema.options;
  assert.ok(channels.length >= 1, '至少一个登记 channel');
  assert.ok(channels.includes('app:get-version'));
});

test('main.cjs 不关闭 context isolation / nodeIntegration', () => {
  const main = fs.readFileSync(path.join(root, 'apps/desktop/main.cjs'), 'utf8');
  assert.doesNotMatch(main, /nodeIntegration\s*:\s*true/, '不得开启 nodeIntegration');
  assert.doesNotMatch(main, /contextIsolation\s*:\s*false/, '不得关闭 contextIsolation');
});

const { pathToFileURL } = require('node:url');
