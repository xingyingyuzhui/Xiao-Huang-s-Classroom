/**
 * Prettier / Stylelint 配置合同（Program 1 Task 1.4）。
 *
 * 断言：prettier 与 stylelint 配置存在且规则符合工程约定；
 * format 脚本按新代码范围执行（本轮不整仓格式化，避免掩盖逻辑改动）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

test('prettier 配置存在且符合约定', () => {
  const file = path.join(root, '.prettierrc.json');
  assert.ok(fs.existsSync(file), '.prettierrc.json 必须存在');
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(cfg.singleQuote, true, 'singleQuote 必须开启');
  assert.equal(cfg.semi, true, 'semi 必须开启');
  assert.equal(cfg.trailingComma, 'all', 'trailingComma 必须为 all');
  assert.ok(fs.existsSync(path.join(root, '.prettierignore')), '.prettierignore 必须存在');
});

test('stylelint 配置存在且覆盖 CSS', () => {
  const file = path.join(root, '.stylelintrc.json');
  assert.ok(fs.existsSync(file), '.stylelintrc.json 必须存在');
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok([].concat(cfg.extends || []).includes('stylelint-config-standard'), '必须 extends stylelint-config-standard');
});

test('format 脚本按新代码范围执行，不整仓格式化', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.format, /prettier --write/, 'format 必须调用 prettier --write');
  assert.match(pkg.scripts['format:check'], /prettier --check/, 'format:check 必须调用 prettier --check');
  assert.match(pkg.scripts['lint:css'], /stylelint/, 'lint:css 必须调用 stylelint');
  // 全仓格式化禁令：format 脚本不得裸写 "prettier --write ."（必须限定 glob）
  assert.ok(!/prettier --write \.($| )/.test(pkg.scripts.format), 'format 不得整仓格式化（避免掩盖逻辑改动）');
});
