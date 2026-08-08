/**
 * Electron 打包布局合同（P1 自包含版）。
 *
 * 普通单测不得依赖仓库 .electron-stage/dist-electron 等生成目录：
 * - 布局逻辑（resolveStageLayout/buildStageManifest/resolvePackagedResourceMappings）
 *   在 scripts/electron-stage-layout.mjs 纯函数中，测试用系统临时目录构造
 *   最小 server fixture 验证；
 * - electron-builder.yml 声明验证（server/dist 映射，mac/win 共用顶层）；
 * - 最终 Resources 布局加载（临时 fixture 模拟）。
 * 真实 electron-builder 产物验证见 test/release/electron-packaged.test.cjs（独立脚本）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function layoutModule() {
  return import(pathToFileURL(path.join(root, 'scripts/electron-stage-layout.mjs')).href);
}

/** 构造最小 server fixture（临时目录）：src/routes/settings.js + dist/domain/policy */
function makeServerFixture(dir) {
  fs.mkdirSync(path.join(dir, 'src/routes'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src/services'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'dist/domain'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src/db'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'src/routes/settings.js'),
    "module.exports = { ok: require('../../dist/domain/settings-policy.js') };\n",
  );
  fs.writeFileSync(
    path.join(dir, 'dist/domain/settings-policy.js'),
    "module.exports = { validateIconDataUrl: (u) => (u && u.startsWith('data:image/') ? u : null), maskApiKey: (k) => '***' };\n",
  );
}

function writeKeyResources(resourcesDir) {
  fs.mkdirSync(path.join(resourcesDir, 'server/routes'), { recursive: true });
  fs.mkdirSync(path.join(resourcesDir, 'dist/domain'), { recursive: true });
  fs.writeFileSync(path.join(resourcesDir, 'server/index.js'), 'module.exports = {};\n');
  fs.writeFileSync(
    path.join(resourcesDir, 'server/routes/settings.js'),
    "module.exports = { policy: require('../../dist/domain/settings-policy.js') };\n",
  );
  fs.writeFileSync(
    path.join(resourcesDir, 'dist/domain/settings-policy.js'),
    "module.exports = { validateIconDataUrl: (u) => (u ? u : null) };\n",
  );
}

test('resolveStageLayout：复制清单正确（最小 fixture，临时目录）', async () => {
  const mod = await layoutModule();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-layout-'));
  try {
    makeServerFixture(dir);
    const layout = mod.resolveStageLayout({
      repoRoot: dir,
      stageRoot: path.join(dir, '.stage'),
      serverSourceRoot: path.join(dir, 'src'),
      serverRoot: dir,
    });
    assert.equal(layout.stageServer, path.join(dir, '.stage', 'server'));
    assert.ok(
      layout.copyDirs.some((c) => c.to.endsWith(path.join('server', 'routes'))),
      'routes 复制',
    );
    assert.ok(
      layout.copyRootDirs.some((c) => c.to.endsWith(path.join('dist', 'domain'))),
      'dist/domain 根级复制',
    );
    for (const d of ['seed', 'public']) {
      if (!fs.existsSync(path.join(dir, 'src', d)) && !fs.existsSync(path.join(dir, d))) {
        assert.ok(layout.missing.includes(d), `missing 含 ${d}`);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('toManifestPath：POSIX 与 Windows 均输出 POSIX 相对路径', async () => {
  const mod = await layoutModule();
  const posix = path.posix;
  const win32 = path.win32;

  assert.equal(
    mod.toManifestPath('/tmp/stage', '/tmp/stage/dist/domain/settings-policy.js', posix),
    'dist/domain/settings-policy.js',
  );
  assert.equal(
    mod.toManifestPath(
      'C:\\work\\.electron-stage',
      'C:\\work\\.electron-stage\\dist\\domain\\settings-policy.js',
      win32,
    ),
    'dist/domain/settings-policy.js',
  );

  assert.throws(
    () => mod.toManifestPath('/tmp/stage', '/other/file.js', posix),
    /拒绝|穿越|无效/,
  );
  assert.throws(
    () =>
      mod.toManifestPath(
        'C:\\work\\.electron-stage',
        'C:\\other\\file.js',
        win32,
      ),
    /拒绝|穿越|无效/,
  );
});

test('buildStageManifest：记录 dist/domain 产物（临时 stage，无绝对路径）', async () => {
  const mod = await layoutModule();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-manifest-'));
  try {
    const stageRoot = path.join(dir, 'stage');
    fs.mkdirSync(path.join(stageRoot, 'dist/domain'), { recursive: true });
    fs.writeFileSync(path.join(stageRoot, 'dist/domain/settings-policy.js'), 'x');
    const { manifestPath, manifest } = mod.buildStageManifest({
      stageRoot,
      appVersion: '9.9.9',
      now: () => '2026-08-08T00:00:00.000Z',
    });
    assert.equal(manifest.appVersion, '9.9.9');
    assert.ok(
      manifest.files.some((f) => f.path === 'dist/domain/settings-policy.js'),
      'manifest 记录 dist/domain',
    );
    for (const f of manifest.files) {
      assert.doesNotMatch(f.path, /^[A-Za-z]:/, '禁止盘符');
      assert.doesNotMatch(f.path, /\\/, '禁止反斜杠');
      assert.doesNotMatch(f.path, /^\//, '禁止绝对路径');
      assert.doesNotMatch(f.path, /(^|\/)\.\.(\/|$)/, '禁止路径穿越');
    }
    assert.ok(fs.existsSync(manifestPath), 'manifest 文件生成');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resolvePackagedResourceMappings：server+dist 映射（与 builder 一致）', async () => {
  const mod = await layoutModule();
  const mappings = mod.resolvePackagedResourceMappings();
  assert.deepEqual(mappings, [
    { from: '.electron-stage/server', to: 'server' },
    { from: '.electron-stage/dist', to: 'dist' },
  ]);
});

test('electron-builder.yml 声明两份复制且 mac/win 共用顶层 extraResources', () => {
  const yml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
  assert.match(yml, /from: \.electron-stage\/server/, 'server 复制声明');
  assert.match(yml, /from: \.electron-stage\/dist/, 'dist 复制声明');
  assert.match(yml, /to: dist/, 'dist 目标');
  assert.doesNotMatch(yml.split('mac:')[1] || '', /extraResources/, 'mac 共用顶层');
  assert.doesNotMatch(yml.split('win:')[1] || '', /extraResources/, 'win 共用顶层');
});

test('最终 Resources 布局：../../dist 同构解析（临时 fixture，与生产同构）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-resources-'));
  try {
    const resources = path.join(dir, 'Contents', 'Resources');
    writeKeyResources(resources);
    const script = [
      "const path = require('path');",
      'const resources = path.resolve(process.argv[1]);',
      "const m = require(path.join(resources, 'server/routes/settings.js'));",
      'if (!m.policy.validateIconDataUrl) process.exit(2);',
      "console.log('PACKAGED_SETTINGS_REQUIRE=ok');",
    ].join('\n');
    const out = execFileSync(process.execPath, ['-e', script, resources], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.match(out, /PACKAGED_SETTINGS_REQUIRE=ok/, '最终布局 ../../dist 同构解析成功');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('findElectronResources：发现 macOS Resources 与 Windows resources fixture', async () => {
  const mod = await layoutModule();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-find-res-'));
  try {
    const mac = path.join(dir, 'mac-arm64', 'App.app', 'Contents', 'Resources');
    const win = path.join(dir, 'win-unpacked', 'resources');
    writeKeyResources(mac);
    writeKeyResources(win);

    const foundMac = mod.findElectronResources(path.join(dir, 'mac-arm64'));
    const foundWin = mod.findElectronResources(path.join(dir, 'win-unpacked'));
    assert.equal(foundMac, mac);
    assert.equal(foundWin, win);

    assert.equal(mod.findElectronResources(path.join(dir, 'missing')), null);

    const emptyRoot = path.join(dir, 'empty-pack');
    fs.mkdirSync(path.join(emptyRoot, 'Contents', 'Resources'), { recursive: true });
    assert.equal(mod.findElectronResources(emptyRoot), null, '空 Resources 必须失败');

    // 多个候选时选择具备关键文件的目录
    const multi = path.join(dir, 'multi');
    const decoy = path.join(multi, 'App.app', 'Contents', 'Resources');
    const real = path.join(multi, 'win-unpacked', 'resources');
    fs.mkdirSync(decoy, { recursive: true });
    fs.writeFileSync(path.join(decoy, 'readme.txt'), 'empty');
    writeKeyResources(real);
    assert.equal(mod.findElectronResources(multi), real);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('copyRuntimePackage：只复制 package.json + files 白名单', async () => {
  const mod = await layoutModule();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-runtime-pkg-'));
  try {
    const src = path.join(dir, 'pkg');
    const dst = path.join(dir, 'out');
    fs.mkdirSync(path.join(src, 'dist'), { recursive: true });
    fs.mkdirSync(path.join(src, 'src'), { recursive: true });
    fs.mkdirSync(path.join(src, 'test'), { recursive: true });
    fs.mkdirSync(path.join(src, 'coverage'), { recursive: true });
    fs.mkdirSync(path.join(src, '.turbo'), { recursive: true });
    fs.writeFileSync(
      path.join(src, 'package.json'),
      JSON.stringify({
        name: '@xiaohuang/example',
        main: './dist/index.cjs',
        module: './dist/index.js',
        files: ['dist'],
      }),
    );
    fs.writeFileSync(path.join(src, 'dist/index.js'), 'export default 1;\n');
    fs.writeFileSync(path.join(src, 'dist/index.cjs'), 'module.exports = 1;\n');
    fs.writeFileSync(path.join(src, 'src/index.ts'), 'export default 1;\n');
    fs.writeFileSync(path.join(src, 'test/example.test.ts'), 'export {};\n');
    fs.writeFileSync(path.join(src, 'coverage/index.html'), '<html></html>\n');
    fs.writeFileSync(path.join(src, '.turbo/log'), 'log\n');
    fs.writeFileSync(path.join(src, 'tsconfig.json'), '{}\n');
    fs.writeFileSync(path.join(src, 'README.md'), 'dev\n');

    const result = mod.copyRuntimePackage({ sourceRoot: src, targetRoot: dst });
    assert.equal(result.packageName, '@xiaohuang/example');

    const kept = [];
    const walk = (base, rel = '') => {
      for (const name of fs.readdirSync(path.join(base, rel))) {
        const r = rel ? `${rel}/${name}` : name;
        const full = path.join(base, r);
        if (fs.statSync(full).isDirectory()) walk(base, r);
        else kept.push(r);
      }
    };
    walk(dst);
    kept.sort();
    assert.deepEqual(kept, ['dist/index.cjs', 'dist/index.js', 'package.json']);
    assert.ok(!fs.existsSync(path.join(dst, 'src')));
    assert.ok(!fs.existsSync(path.join(dst, 'test')));
    assert.ok(!fs.existsSync(path.join(dst, 'coverage')));
    assert.ok(!fs.existsSync(path.join(dst, '.turbo')));
    assert.ok(!fs.existsSync(path.join(dst, 'tsconfig.json')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('生产 settings.js 产物引用是单一 ../../dist 合同（真实文件结构断言）', () => {
  const src = fs.readFileSync(path.join(root, 'apps/server/src/routes/settings.js'), 'utf8');
  const requireRefs = src.match(/require\([^)]*settings-policy[^)]*\)/g) || [];
  assert.equal(requireRefs.length, 1, '生产 settings.js 只 require 一处产物路径');
  assert.match(requireRefs[0], /dist\/domain\/settings-policy\.js/, '引用 <root>/dist/domain');
});

test('stage script 使用 execFileSync 无 shell smoke，且调用 copyRuntimePackage', () => {
  const script = fs.readFileSync(path.join(root, 'scripts/stage-electron-server.js'), 'utf8');
  assert.match(script, /execFileSync/);
  assert.match(script, /copyRuntimePackage/);
  assert.doesNotMatch(script, /execSync\(`node -e/);
  assert.match(script, /Stage smoke require FAILED/);
});
