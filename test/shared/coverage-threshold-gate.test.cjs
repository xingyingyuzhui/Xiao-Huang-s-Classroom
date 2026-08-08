/**
 * Coverage 阈值有效性合同（四轮：隔离版）。
 *
 * 在临时目录用临时 vitest 配置验证（不写入/修改仓库真实 vitest.config.ts）：
 * 1. 不可达阈值（statements 101）导致非零退出，输出含阈值失败信息。
 * 2. 正常阈值通过。
 * 3. 执行前后工作树不变（git diff --exit-code 无变化）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = require('../helpers/repo-root.js');

/** 临时 workspace：src + 测试 + vitest 配置（可注入阈值） */
function makeTempWorkspace(thresholds) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-cov-gate-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/target.ts'), 'export const one = 1;\nexport function add(a: number, b: number) { return a + b; }\n');
  fs.writeFileSync(
    path.join(dir, 'test/target.test.ts'),
    "import { expect, it } from 'vitest';\nimport { add, one } from '../src/target.js';\nit('works', () => { expect(add(1, 2)).toBe(3); expect(one).toBe(1); });\n",
  );
  fs.writeFileSync(
    path.join(dir, 'vitest.config.ts'),
    [
      "import { defineConfig } from 'vitest/config';",
      'export default defineConfig({',
      '  test: {',
      "    include: ['test/**/*.test.ts'],",
      "    environment: 'node',",
      '    coverage: {',
      "      include: ['src/**'],",
      '      thresholds: {',
      `        statements: ${thresholds},`,
      '      },',
      '    },',
      '  },',
      '});',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'cov-gate', private: true, type: 'module' }));
  // 复用仓库 node_modules（vitest 可解析）
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  return dir;
}

function runCoverage(dir) {
  // cwd=dir 让 vitest 定位 dir/vitest.config.ts（--root 会导致 coverage 统计异常）
  return execFileSync(
    process.execPath,
    [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--coverage'],
    { cwd: dir, encoding: 'utf8', env: { ...process.env, NODE_PATH: path.join(root, 'node_modules') } },
  );
}

test('不可达阈值导致非零退出且输出含阈值失败信息；恢复正常阈值通过', () => {
  // 基线：当前工作树 diff（允许既有未提交改动；只断言测试运行不引入新改动）
  const before = execFileSync('git', ['diff'], { cwd: root, encoding: 'utf8' });
  const dir = makeTempWorkspace(101); // 不可达
  try {
    let failed = false;
    try {
      runCoverage(dir);
    } catch (err) {
      failed = true;
      const out = String(err.stdout || '') + String(err.stderr || '');
      assert.match(out, /ERROR|threshold|does not meet/i, '失败输出含阈值说明');
    }
    assert.equal(failed, true, '不可达阈值必须非零退出');
    // 正常阈值（当前实现约 100% 可测：阈值 100 可达）
    const okDir = makeTempWorkspace(100);
    try {
      const out = runCoverage(okDir);
      assert.doesNotMatch(out, /ERROR/i, '可达阈值通过');
    } finally {
      fs.rmSync(okDir, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  // 工作树不变（测试运行不引入新改动）
  const after = execFileSync('git', ['diff'], { cwd: root, encoding: 'utf8' });
  assert.equal(after, before, '测试前后工作树不变');
});

test('测试不修改仓库真实 vitest.config.ts', () => {
  const cfgPath = path.join(root, 'packages/contracts/vitest.config.ts');
  const before = fs.readFileSync(cfgPath, 'utf8');
  // 本文件不写真实配置；断言契约测试执行后仍一致（由上一测试的 git diff 保证）
  assert.match(before, /statements: 95/, 'contracts 真实阈值未被修改');
});
