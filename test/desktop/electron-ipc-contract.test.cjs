/**
 * Electron IPC / 安全合同（Program 6 Task 6.1 现状）。
 *
 * Desktop 生产代码尚未消费 @xiaohuang/contracts schema，
 * 因此不在此测试中导入 contracts dist（避免隐藏构建依赖）。
 * IPC channel schema 行为测试归属 packages/contracts。
 * Task 6.1（Main/Preload 全量接线）仍未完成。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

test('main.ts 不关闭 context isolation / nodeIntegration', () => {
  const main = fs.readFileSync(path.join(root, 'apps/desktop/src/main.ts'), 'utf8');
  assert.doesNotMatch(main, /nodeIntegration\s*:\s*true/, '不得开启 nodeIntegration');
  assert.doesNotMatch(main, /contextIsolation\s*:\s*false/, '不得关闭 contextIsolation');
});

test('desktop 生产代码尚未依赖 @xiaohuang/contracts（Task 6.1 未接线）', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'apps/desktop/package.json'), 'utf8'),
  );
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };
  assert.equal(
    deps['@xiaohuang/contracts'],
    undefined,
    '在生产未使用前不得仅为测试声明 contracts 依赖',
  );

  const main = fs.readFileSync(path.join(root, 'apps/desktop/src/main.ts'), 'utf8');
  assert.doesNotMatch(main, /@xiaohuang\/contracts|ipcChannelSchema/, 'main 未消费 contracts');

  // C4：main.cjs 是薄转发桥（权威源在 src/main.ts）
  const bridge = fs.readFileSync(path.join(root, 'apps/desktop/main.cjs'), 'utf8');
  assert.match(bridge, /require\('\.\/dist\/main\.js'\)/, 'main.cjs 薄转发到 TS 产物');
});

test('main.ts 启动失败有可见错误（非静默退出）', () => {
  const main = fs.readFileSync(path.join(root, 'apps/desktop/src/main.ts'), 'utf8');
  assert.match(main, /dialog/);
  assert.match(main, /showMessageBox|showErrorBox/);
});
