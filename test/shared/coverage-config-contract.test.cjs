/**
 * Coverage 配置合同（真实临时 fixture 红绿版）。
 *
 * 校验逻辑在 tooling/coverage/*，支持注入 packagesRoot。
 * 仓库级检查走真实 packages/；红绿断言只使用系统临时目录 fixture。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function loadValidate() {
  return import(pathToFileURL(path.join(root, 'tooling/coverage/validate-workspaces.mjs')).href);
}

function writePkg(dir, name, pkg) {
  const pkgDir = path.join(dir, name);
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(pkg, null, 2));
  return pkgDir;
}

const goodConfig = `
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    coverage: {
      include: ['src/**'],
      exclude: ['dist/**', 'coverage/**', 'test/**'],
      thresholds: { statements: 80, branches: 70, functions: 80, lines: 80 },
    },
  },
});
`;

test('仓库 packages：动态发现的 coverage workspace 全部合规', async () => {
  const { validateCoverageWorkspaces } = await loadValidate();
  const { workspaces, violations } = validateCoverageWorkspaces({
    packagesRoot: path.join(root, 'packages'),
  });
  assert.ok(workspaces.length >= 9, `至少 9 个 coverage workspace（实际 ${workspaces.length}）`);
  assert.deepEqual(violations, [], `仓库 coverage 违规: ${violations.join('; ')}`);
});

test('每个 coverage workspace 声明了可解析的 coverage script（不在此真实跑覆盖率）', () => {
  // 真实 `vitest --coverage` 由 `npm run coverage`（quality 后半段）统一执行。
  // 此处再抽样执行会与并行 shared 测试 / 其它 coverage 写 packages/*/coverage/.tmp 竞态（ENOENT）。
  const pkgs = fs
    .readdirSync(path.join(root, 'packages'))
    .filter((name) => {
      const pkgPath = path.join(root, 'packages', name, 'package.json');
      if (!fs.existsSync(pkgPath)) return false;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return typeof pkg.scripts?.coverage === 'string';
    })
    .sort();
  assert.ok(pkgs.length >= 9, `至少 9 个 coverage workspace（实际 ${pkgs.length}）`);
  for (const name of pkgs) {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'packages', name, 'package.json'), 'utf8'),
    );
    const script = String(pkg.scripts.coverage);
    assert.match(
      script,
      /vitest\s+run\s+--coverage/,
      `${name}.scripts.coverage 应为 vitest run --coverage，实际: ${script}`,
    );
    assert.ok(
      fs.existsSync(path.join(root, 'packages', name, 'vitest.config.ts')),
      `${name} 必须有 vitest.config.ts`,
    );
  }
});

test('红绿：临时 fixture 无 config 必须失败，补齐后通过', async () => {
  const { validateCoverageWorkspaces } = await loadValidate();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-ws-'));
  const packagesRoot = path.join(tmp, 'packages');
  try {
    writePkg(packagesRoot, 'example', {
      name: '@xiaohuang/example',
      scripts: { coverage: 'vitest run --coverage' },
    });

    let result = validateCoverageWorkspaces({ packagesRoot });
    assert.deepEqual(result.workspaces, ['example']);
    assert.ok(
      result.violations.some((v) => /缺少 vitest\.config\.ts/.test(v)),
      `应报告缺 config，实际: ${result.violations.join('; ')}`,
    );

    const pkgDir = path.join(packagesRoot, 'example');
    fs.writeFileSync(path.join(pkgDir, 'vitest.config.ts'), goodConfig);
    fs.mkdirSync(path.join(pkgDir, 'test'), { recursive: true });
    fs.mkdirSync(path.join(pkgDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'test/example.test.ts'), "import { expect, it } from 'vitest'; it('x', () => expect(1).toBe(1));\n");
    fs.writeFileSync(path.join(pkgDir, 'src/index.ts'), 'export const x = 1;\n');

    result = validateCoverageWorkspaces({ packagesRoot });
    assert.deepEqual(result.violations, [], `补齐后应通过: ${result.violations.join('; ')}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('红绿：coverage script 存在但无 test / thresholds 全 0 / include 错误 / 缺 exclude', async () => {
  const { validateCoverageWorkspaces } = await loadValidate();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-bad-'));
  const packagesRoot = path.join(tmp, 'packages');
  try {
    // 无 test
    const noTest = writePkg(packagesRoot, 'no-test', {
      name: '@xiaohuang/no-test',
      scripts: { coverage: 'vitest run --coverage' },
    });
    fs.writeFileSync(path.join(noTest, 'vitest.config.ts'), goodConfig);
    fs.mkdirSync(path.join(noTest, 'test'), { recursive: true });

    // thresholds 全 0
    const zero = writePkg(packagesRoot, 'zero-th', {
      name: '@xiaohuang/zero-th',
      scripts: { coverage: 'vitest run --coverage' },
    });
    fs.writeFileSync(
      path.join(zero, 'vitest.config.ts'),
      goodConfig.replace(/:\s*80/g, ': 0').replace(/:\s*70/g, ': 0'),
    );
    fs.mkdirSync(path.join(zero, 'test'), { recursive: true });
    fs.writeFileSync(path.join(zero, 'test/a.test.ts'), 'export {};\n');

    // include 不是 src/**
    const badInc = writePkg(packagesRoot, 'bad-inc', {
      name: '@xiaohuang/bad-inc',
      scripts: { coverage: 'vitest run --coverage' },
    });
    fs.writeFileSync(
      path.join(badInc, 'vitest.config.ts'),
      goodConfig.replace("include: ['src/**']", "include: ['lib/**']"),
    );
    fs.mkdirSync(path.join(badInc, 'test'), { recursive: true });
    fs.writeFileSync(path.join(badInc, 'test/a.test.ts'), 'export {};\n');

    // 缺 exclude
    const noEx = writePkg(packagesRoot, 'no-ex', {
      name: '@xiaohuang/no-ex',
      scripts: { coverage: 'vitest run --coverage' },
    });
    fs.writeFileSync(
      path.join(noEx, 'vitest.config.ts'),
      `
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    coverage: {
      include: ['src/**'],
      exclude: [],
      thresholds: { statements: 80, branches: 70, functions: 80, lines: 80 },
    },
  },
});
`,
    );
    fs.mkdirSync(path.join(noEx, 'test'), { recursive: true });
    fs.writeFileSync(path.join(noEx, 'test/a.test.ts'), 'export {};\n');

    const { violations } = validateCoverageWorkspaces({ packagesRoot });
    assert.ok(violations.some((v) => /no-test.*无测试/.test(v)), violations.join('\n'));
    assert.ok(violations.some((v) => /zero-th.*thresholds/.test(v)), violations.join('\n'));
    assert.ok(violations.some((v) => /bad-inc.*include/.test(v)), violations.join('\n'));
    assert.ok(violations.some((v) => /no-ex.*exclude/.test(v)), violations.join('\n'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('不得维护手工 PACKAGES 数组作为发现源', () => {
  const testSrc = fs.readFileSync(__filename, 'utf8');
  assert.doesNotMatch(testSrc, /const PACKAGES\s*=\s*\[/, '不得维护手工包名列表');
});
