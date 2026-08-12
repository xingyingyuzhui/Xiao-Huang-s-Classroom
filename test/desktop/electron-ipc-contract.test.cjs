/**
 * Electron IPC / 安全合同（Phase 8：account IPC + vault）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const {
  ACCOUNT_IPC_CHANNELS,
  ipcChannelSchema,
  isAllowedIpcSenderOrigin,
  parseAccountIpcPayload,
  parseTrustedCloudOrigin,
} = require('@xiaohuang/contracts');

test('main.ts 不关闭 context isolation / nodeIntegration', () => {
  const main = fs.readFileSync(path.join(root, 'apps/desktop/src/main.ts'), 'utf8');
  assert.doesNotMatch(main, /nodeIntegration\s*:\s*true/, '不得开启 nodeIntegration');
  assert.doesNotMatch(main, /contextIsolation\s*:\s*false/, '不得关闭 contextIsolation');
  assert.match(main, /sandbox:\s*true/);
});

test('desktop 生产代码消费 @xiaohuang/contracts IPC allowlist', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'apps/desktop/package.json'), 'utf8'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  assert.ok(deps['@xiaohuang/contracts'], 'desktop 须声明 @xiaohuang/contracts');

  const main = fs.readFileSync(path.join(root, 'apps/desktop/src/main.ts'), 'utf8');
  assert.match(main, /parseTrustedCloudOrigin/);
  assert.match(main, /@xiaohuang\/contracts/);

  const ipc = fs.readFileSync(path.join(root, 'apps/desktop/src/account-ipc.ts'), 'utf8');
  assert.match(ipc, /isAllowedIpcSenderOrigin/);
  assert.match(ipc, /senderFrame/);
  assert.match(ipc, /ACCOUNT_IPC_CHANNELS/);

  const bridge = fs.readFileSync(path.join(root, 'apps/desktop/main.cjs'), 'utf8');
  assert.match(bridge, /require\('\.\/dist\/main\.js'\)/, 'main.cjs 薄转发到 TS 产物');
});

test('preload 只暴露 allowlist 内账户通道且不暴露 refresh token API', () => {
  const preload = fs.readFileSync(path.join(root, 'apps/desktop/src/preload-account.ts'), 'utf8');
  assert.doesNotMatch(preload, /storeRefreshToken|getRefreshToken|refreshToken/);
  for (const channel of ACCOUNT_IPC_CHANNELS) {
    assert.match(preload, new RegExp(channel.replace(':', '\\:')), `preload 须引用 ${channel}`);
  }
  assert.match(preload, /contextBridge\.exposeInMainWorld\(\s*'xiaohuangAccount'/);
});

test('IPC origin / schema helpers reject arbitrary cloudOrigin', () => {
  assert.equal(isAllowedIpcSenderOrigin('https://evil.example', ['http://127.0.0.1:9']), false);
  assert.equal(isAllowedIpcSenderOrigin('file://', ['file://']), true);
  assert.equal(isAllowedIpcSenderOrigin('http://127.0.0.1:7788', ['http://127.0.0.1:7788']), true);

  const hijack = parseAccountIpcPayload('account:login', {
    username: 'teacher01',
    password: 'password123',
    deviceLabel: 'Desktop',
    cloudOrigin: 'https://evil.example',
  });
  assert.equal(hijack.success, false);

  const packagedHttp = parseTrustedCloudOrigin('http://127.0.0.1:3000', { packaged: true });
  assert.equal(packagedHttp.ok, false);
});

test('allowlist 含全部账户通道', () => {
  for (const channel of ACCOUNT_IPC_CHANNELS) {
    assert.ok(ipcChannelSchema.options.includes(channel), channel);
  }
});

test('main.ts 启动失败有可见错误（非静默退出）', () => {
  const main = fs.readFileSync(path.join(root, 'apps/desktop/src/main.ts'), 'utf8');
  assert.match(main, /dialog/);
  assert.match(main, /showMessageBox|showErrorBox/);
});
