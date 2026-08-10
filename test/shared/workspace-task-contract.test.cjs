/**
 * Workspace 标准任务合同（R2/R4）：
 * 所有应参加 Turbo 的 workspace 必须有 test/typecheck（build 可选）标准脚本；
 * 每个测试目录只有一个权威 runner；根 pretest 不得绕开 Turbo 依赖图；
 * 任意 package script 不得指向空 glob（否则 Turbo/CI 假绿）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const WORKSPACES = [
  'web',
  'server',
  'desktop',
  'config',
  'domain-core',
  'contracts',
  'test-kit',
  'design-tokens',
  'ui',
  'subject-kit',
  'math-expr',
  'subject-settings',
];

function readPkg(relativeDir) {
  return JSON.parse(fs.readFileSync(path.join(root, relativeDir, 'package.json'), 'utf8'));
}

/** 递归列出目录下所有文件（相对路径） */
function listFiles(absoluteDir, base = absoluteDir) {
  const out = [];
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const abs = path.join(absoluteDir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(abs, base));
    else out.push(path.relative(base, abs));
  }
  return out;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 展开 {a,b,c} 交替（只处理单层嵌套，覆盖现有脚本） */
function expandBraces(pattern) {
  const m = pattern.match(/\{([^{}]*)\}/);
  if (!m) return [pattern];
  const out = [];
  for (const alt of m[1].split(',')) {
    out.push(...expandBraces(pattern.replace(m[0], alt)));
  }
  return out;
}

/**
 * 判断 glob（相对 rootDir）是否至少命中一个文件。
 * 支持 *（单段内）、**（跨目录）、{a,b} 与开头 ../ 相对段；
 * 目录不存在视为未命中。
 */
function globMatches(rootDir, pattern) {
  const clean = pattern.replace(/^"|"$/g, '');
  for (const expanded of expandBraces(clean)) {
    const parts = expanded.split('/');
    // 解析开头的字面段（../、目录名）到实际起始目录
    let startDir = rootDir;
    let idx = 0;
    while (idx < parts.length && !parts[idx].includes('*')) {
      const seg = parts[idx];
      if (seg === '..') {
        startDir = path.dirname(startDir);
      } else if (seg !== '' && seg !== '.') {
        startDir = path.join(startDir, seg);
      }
      idx += 1;
    }
    const walk = (dir, i) => {
      if (i === parts.length) return true;
      const part = parts[i];
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return false;
      }
      if (part === '**') {
        if (i === parts.length - 1) return true;
        if (walk(dir, i + 1)) return true;
        for (const e of entries) {
          if (e.isDirectory() && walk(path.join(dir, e.name), i)) return true;
        }
        return false;
      }
      const re = new RegExp(`^${part.split('*').map(escapeRegExp).join('[^/]*')}$`);
      for (const e of entries) {
        if (re.test(e.name)) {
          if (i === parts.length - 1) return true;
          if (e.isDirectory() && walk(path.join(dir, e.name), i + 1)) return true;
        }
      }
      return false;
    };
    if (walk(startDir, idx)) return true;
  }
  return false;
}

test('所有 workspace 提供标准 test 任务（turbo run test 可发现）', () => {
  for (const name of WORKSPACES) {
    const appsPath = path.join(root, 'apps', name, 'package.json');
    const pkgPath = fs.existsSync(appsPath)
      ? appsPath
      : path.join(root, 'packages', name, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.equal(typeof pkg.scripts?.test, 'string', `${name} 必须有 test 脚本`);
  }
});

test('apps（web/server/desktop）提供标准 typecheck 任务', () => {
  for (const name of ['web', 'server', 'desktop']) {
    const pkg = readPkg(`apps/${name}`);
    assert.equal(typeof pkg.scripts?.typecheck, 'string', `apps/${name} 必须有 typecheck 脚本`);
  }
});

test('apps/server 提供 build 任务（TS 产物构建链）', () => {
  const pkg = readPkg('apps/server');
  assert.equal(typeof pkg.scripts?.build, 'string', 'apps/server 必须有 build 脚本');
  assert.equal(typeof pkg.scripts?.test, 'string', 'apps/server 必须有 test 脚本');
});

test('Server 测试唯一权威 runner：vitest run，禁 node --test 第二入口', () => {
  const serverPkg = readPkg('apps/server');
  const testScript = serverPkg.scripts.test;
  assert.ok(testScript.includes('vitest run'), `server test 必须走 vitest: ${testScript}`);
  assert.doesNotMatch(testScript, /node --test/, 'server test 不得包含 node --test（无第二入口）');
  assert.doesNotMatch(
    testScript,
    /test\/server/,
    'server test 不得引用根 test/server（已迁移到 owner）',
  );
  // 旧根 test/server 目录必须不存在，避免未来误认为仍有第二测试入口
  assert.equal(
    fs.existsSync(path.join(root, 'test/server')),
    false,
    '根 test/server 目录必须不存在（fixture 已移到 apps/server/test/fixtures）',
  );
});

test('Server 测试全部位于 apps/server/test/**/*.test.ts（vitest include 覆盖）', () => {
  const cfg = fs.readFileSync(path.join(root, 'apps/server/vitest.config.ts'), 'utf8');
  assert.match(cfg, /test\/\*\*\/\*\.test\.ts/, 'vitest include 覆盖 apps/server/test');
  const files = listFiles(path.join(root, 'apps/server/test'));
  assert.ok(files.length >= 20, `apps/server/test 应有大量测试文件，实际 ${files.length}`);
  for (const f of files) {
    if (f.endsWith('.ts')) {
      assert.ok(f.endsWith('.test.ts'), `apps/server/test 内 TS 文件必须是 *.test.ts: ${f}`);
    } else {
      assert.equal(
        f,
        'fixtures/v1-endpoints.generated.json',
        `apps/server/test 只允许 fixture 非 TS 文件: ${f}`,
      );
    }
  }
});

test('Electron 测试唯一归属 desktop workspace（无重复执行入口）', () => {
  const desktopPkg = readPkg('apps/desktop');
  assert.match(desktopPkg.scripts.test, /test\/desktop/, 'desktop test 覆盖 test/desktop');
  assert.doesNotMatch(desktopPkg.scripts.test, /test\/server/, 'desktop 不跑 server 测试');
  const desktopFiles = fs
    .readdirSync(path.join(root, 'test/desktop'))
    .filter((f) => f.endsWith('.cjs'));
  assert.ok(desktopFiles.includes('electron-startup.test.cjs'), 'electron-startup 在 test/desktop');
  assert.ok(
    desktopFiles.includes('electron-ipc-contract.test.cjs'),
    'electron-ipc 在 test/desktop',
  );
});

test('根 shared 测试只运行 test/shared（单一归属）', () => {
  const pkg = readPkg('.');
  assert.match(pkg.scripts.test, /test\/shared\/\*\.cjs/, '根 test 运行 test/shared/*.cjs');
  assert.doesNotMatch(
    pkg.scripts.test,
    /test\/web|test\/desktop|test\/server|test\/release/,
    '根 test 只跑 test/shared',
  );
});

test('根 pretest 已删除：不绕开 Turbo 依赖图重复构建 server', () => {
  const pkg = readPkg('.');
  assert.equal(
    pkg.scripts.pretest,
    undefined,
    '根 pretest 必须删除（turbo test.dependsOn build/^build 已编排）',
  );
});

test('任意 package script 不存在指向空 glob 的路径（Turbo/CI 假绿防护）', () => {
  const pkgs = [{ label: 'root', dir: root }];
  for (const group of ['apps', 'packages']) {
    for (const name of fs.readdirSync(path.join(root, group))) {
      const pkgPath = path.join(root, group, name, 'package.json');
      if (!fs.existsSync(pkgPath)) continue;
      pkgs.push({ label: `${group}/${name}`, dir: path.join(root, group, name) });
    }
  }
  const emptyGlobs = [];
  for (const { label, dir } of pkgs) {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    for (const [scriptName, script] of Object.entries(pkg.scripts || {})) {
      for (const token of String(script).split(/\s+/)) {
        if (!token.includes('*')) continue;
        if (!globMatches(dir, token)) {
          emptyGlobs.push(`${label} scripts.${scriptName}: ${token}`);
        }
      }
    }
  }
  assert.deepEqual(
    emptyGlobs,
    [],
    `指向空 glob 的脚本路径（必须删除或修正）:\n${emptyGlobs.join('\n')}`,
  );
});
