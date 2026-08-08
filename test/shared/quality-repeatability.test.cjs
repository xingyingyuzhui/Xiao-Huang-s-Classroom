/**
 * coverage 产物生成后 lint/style/format/architecture 不受污染（R3/五轮）。
 *
 * 注意：本测试不递归执行完整 quality（避免嵌套）；完整 quality 连续两次
 * 由 CI 独立 repeatability job（quality-repeated.yml）验证。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = require('../helpers/repo-root.js');

test('stylelint 配置排除 coverage 等生成目录', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, '.stylelintrc.json'), 'utf8'));
  for (const pattern of ['**/coverage/**', '**/dist/**', '**/.electron-stage/**', 'dist-electron/**', 'dist-exe/**']) {
    assert.ok(cfg.ignoreFiles.includes(pattern), `stylelint 必须排除 ${pattern}`);
  }
});

test('coverage 产物生成后 lint:css 仍通过（回归合同）', () => {
  // 先生成 coverage（若存在产物则复用；不存在则跑一次）
  if (!fs.existsSync(path.join(root, 'packages/domain-core/coverage'))) {
    execFileSync('npm', ['run', 'coverage'], { cwd: root, stdio: 'pipe' });
  }
  assert.ok(
    fs.existsSync(path.join(root, 'packages/domain-core/coverage')),
    'coverage 产物已生成',
  );
  // lint:css 必须通过（不被 coverage CSS 干扰）
  const out = execFileSync('npm', ['run', 'lint:css'], { cwd: root, encoding: 'utf8' });
  assert.doesNotMatch(out, /✖/, 'lint:css 无错误');
});

test('eslint/prettier/arch 不扫描 coverage（生成目录隔离）', () => {
  const eslint = fs.readFileSync(path.join(root, 'eslint.config.mjs'), 'utf8');
  assert.match(eslint, /coverage/, 'eslint 排除 coverage');
  const prettier = fs.readFileSync(path.join(root, '.prettierignore'), 'utf8');
  assert.match(prettier, /coverage/, 'prettier 排除 coverage');
  const arch = fs.readFileSync(path.join(root, 'tooling/architecture/check-dependencies.mjs'), 'utf8');
  assert.match(arch, /coverage/, 'arch 检查排除 coverage');
});
