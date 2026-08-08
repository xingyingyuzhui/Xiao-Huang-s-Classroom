/**
 * Electron 最终打包布局合同（一轮）。
 *
 * 基于真实 stage 产物（.electron-stage）模拟 electron-builder 的
 * extraResources 复制（server → Resources/server；dist → Resources/dist），
 * 从最终 Resources 布局加载 settings 路由：
 * 1. 不再出现 MODULE_NOT_FOUND（../../dist 同构解析到 Resources/dist）。
 * 2. electron-builder.yml 声明两份复制（mac/win 共用顶层 extraResources）。
 * 3. stage manifest 记录 dist/domain 且 builder 声明打包（范围一致）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = require('../helpers/repo-root.js');

const stageRoot = path.join(root, '.electron-stage');
const stageServer = path.join(stageRoot, 'server');
const stageDist = path.join(stageRoot, 'dist');

test('最终 Resources 布局：从 server/routes/settings.js 加载 policy 成功（../../dist 同构）', () => {
  assert.ok(
    fs.existsSync(path.join(stageDist, 'domain', 'settings-policy.js')),
    '前置：stage 产物含 dist/domain/settings-policy.js',
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-packaged-layout-'));
  try {
    // 模拟 extraResources 复制：server → Resources/server；dist → Resources/dist
    const resources = path.join(dir, 'Contents', 'Resources');
    fs.cpSync(stageServer, path.join(resources, 'server'), { recursive: true });
    fs.cpSync(stageDist, path.join(resources, 'dist'), { recursive: true });
    for (const f of [
      'server/index.js',
      'server/routes/settings.js',
      'dist/domain/settings-policy.js',
    ]) {
      assert.ok(fs.existsSync(path.join(resources, f)), `最终布局含 ${f}`);
    }
    // 从最终布局加载 settings 路由（依赖经 stage node_modules 解析）
    const script = [
      "const path = require('path');",
      "const resources = process.argv[1];",
      "require(path.join(resources, 'server/routes/settings.js'));",
      "console.log('PACKAGED_SETTINGS_REQUIRE=ok');",
    ].join('\n');
    const out = execFileSync(process.execPath, ['-e', script, resources], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NODE_PATH: path.join(stageServer, 'node_modules') },
    });
    assert.match(out, /PACKAGED_SETTINGS_REQUIRE=ok/, '最终布局加载成功');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('electron-builder.yml 声明复制 .electron-stage/dist → dist（mac/win 共用）', () => {
  const yml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
  assert.match(yml, /from: \.electron-stage\/server/, 'server 复制声明存在');
  assert.match(yml, /from: \.electron-stage\/dist/, 'dist 复制声明存在');
  assert.match(yml, /to: dist/, 'dist 目标声明存在');
  assert.doesNotMatch(yml.split('mac:')[1] || '', /extraResources/, 'mac 不另设（共用顶层）');
  assert.doesNotMatch(yml.split('win:')[1] || '', /extraResources/, 'win 不另设（共用顶层）');
});

test('stage manifest 记录 dist/domain 且 builder 声明打包（范围一致）', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(stageRoot, 'stage-manifest.json'), 'utf8'),
  );
  assert.ok(
    manifest.files.some((f) => f.path.startsWith('dist/domain/')),
    'manifest 记录 dist/domain 产物',
  );
  const builder = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
  assert.match(builder, /\.electron-stage\/dist/, 'builder 打包 stage 根 dist');
});

test('settings.js 注释与实际 stage 路径一致', () => {
  const src = fs.readFileSync(path.join(root, 'apps/server/src/routes/settings.js'), 'utf8');
  assert.match(src, /\.electron-stage\/dist/, '注释描述 stage 布局为 .electron-stage/dist');
  assert.match(src, /Contents\/Resources\/dist/, '注释描述最终包布局');
});

test('真实打包产物验证（electron-builder 生成的应用目录，动态发现 Resources）', () => {
  const distRoot = path.join(root, 'dist-electron');
  if (!fs.existsSync(distRoot)) {
    // 未打包时跳过（pack:electron 验收单独执行）；有产物则必须验证
    return;
  }
  // 动态发现任意平台的 Resources（不写死 Mac 路径）
  const walk = (dir, depth = 0) => {
    if (depth > 5) return null;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'Resources') return full;
        const found = walk(full, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  const resources = walk(distRoot);
  assert.ok(resources, '发现打包产物的 Resources 目录');
  // 三个关键文件存在
  for (const f of ['server/index.js', 'server/routes/settings.js', 'dist/domain/settings-policy.js']) {
    assert.ok(fs.existsSync(path.join(resources, f)), `最终包含 ${f}`);
  }
  // 从最终包加载 settings 路由（不再 MODULE_NOT_FOUND）
  const script = [
    "const path = require('path');",
    "const resources = path.resolve(process.argv[1]);",
    "require(path.join(resources, 'server/routes/settings.js'));",
    "console.log('PACKAGED_SETTINGS_REQUIRE=ok');",
  ].join('\n');
  const out = execFileSync(process.execPath, ['-e', script, resources], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_PATH: path.join(resources, 'server', 'node_modules') },
  });
  assert.match(out, /PACKAGED_SETTINGS_REQUIRE=ok/, '最终包 settings 路由可加载');
});
