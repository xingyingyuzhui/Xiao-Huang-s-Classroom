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

test('coverage 产物存在时 lint:css 仍通过（回归合同）', () => {
  // 不在 shared 测试里跑真实 turbo coverage（与并行 coverage 写 .tmp 竞态）。
  // 投放一份合成 coverage CSS，验证 stylelint 忽略规则生效即可。
  const covDir = path.join(root, 'packages/domain-core/coverage');
  const planted = path.join(covDir, '__quality-repeatability-plant.css');
  const plantedHere = !fs.existsSync(planted);
  fs.mkdirSync(covDir, { recursive: true });
  // 故意写非法 CSS：若被 stylelint 扫到必失败
  fs.writeFileSync(planted, 'this is {{{ not valid css !!!\n');
  try {
    assert.ok(fs.existsSync(covDir), 'coverage 目录应存在');
    const out = execFileSync('npm', ['run', 'lint:css'], { cwd: root, encoding: 'utf8' });
    assert.doesNotMatch(out, /✖/, 'lint:css 无错误（coverage 内脏文件被 ignore）');
    assert.doesNotMatch(out, /__quality-repeatability-plant/, '不得 lint coverage 投放文件');
  } finally {
    if (plantedHere) {
      try {
        fs.rmSync(planted, { force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
  }
});

test('eslint/prettier/arch 不扫描 coverage（生成目录隔离）', () => {
  const eslint = fs.readFileSync(path.join(root, 'eslint.config.mjs'), 'utf8');
  assert.match(eslint, /coverage/, 'eslint 排除 coverage');
  const prettier = fs.readFileSync(path.join(root, '.prettierignore'), 'utf8');
  assert.match(prettier, /coverage/, 'prettier 排除 coverage');
  const arch = fs.readFileSync(path.join(root, 'tooling/architecture/check-dependencies.mjs'), 'utf8');
  assert.match(arch, /coverage/, 'arch 检查排除 coverage');
});
