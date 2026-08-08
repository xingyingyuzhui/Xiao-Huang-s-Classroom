/**
 * 真实 Electron 发布产物门禁（P1/P2 第二层）。
 *
 * 独立于普通单测（npm run test:electron-packaged）：
 * 必须在 npm run pack:electron 之后执行；找不到具备关键文件的
 * Resources/resources 时**必须失败**（不得 return、不得静默跳过）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function loadLayout() {
  return import(pathToFileURL(path.join(root, 'scripts/electron-stage-layout.mjs')).href);
}

test('electron-builder 真实产物：三关键文件存在且 settings route 可加载', async () => {
  const distRoot = path.join(root, 'dist-electron');
  assert.ok(fs.existsSync(distRoot), 'dist-electron 必须存在（先执行 npm run pack:electron）');
  const { findElectronResources } = await loadLayout();
  const resources = findElectronResources(distRoot);
  assert.ok(resources, '必须发现具备关键文件的 Resources/resources 目录（无产物即失败）');
  for (const f of ['server/index.js', 'server/routes/settings.js', 'dist/domain/settings-policy.js']) {
    assert.ok(fs.existsSync(path.join(resources, f)), `最终包必须含 ${f}`);
  }
  const script = [
    "const path = require('path');",
    'const resources = path.resolve(process.argv[1]);',
    "require(path.join(resources, 'server/routes/settings.js'));",
    "console.log('PACKAGED_SETTINGS_REQUIRE=ok');",
  ].join('\n');
  const out = execFileSync(process.execPath, ['-e', script, resources], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_PATH: path.join(resources, 'server', 'node_modules') },
  });
  assert.match(out, /PACKAGED_SETTINGS_REQUIRE=ok/, '从最终包加载 settings 路由成功');
});
