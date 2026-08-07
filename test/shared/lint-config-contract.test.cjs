/**
 * ESLint Flat Config 合同（Program 1 Task 1.3）。
 *
 * 断言：flat config 存在、typescript-eslint 接入、TS 关键规则开启、
 * lint baseline 快照存在且可被 lint-baseline 脚本消费。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

test('eslint.config.mjs 存在且接入 typescript-eslint 与 no-explicit-any', () => {
  const file = path.join(root, 'eslint.config.mjs');
  assert.ok(fs.existsSync(file), 'eslint.config.mjs 必须存在');
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /typescript-eslint/, '必须接入 typescript-eslint');
  assert.match(src, /@eslint\/js/, '必须接入 @eslint/js');
  assert.match(src, /no-explicit-any/, 'TS 规则必须包含 no-explicit-any');
});

test('lint baseline 快照存在且可解析', () => {
  const file = path.join(root, 'docs/engineering/lint-baseline.json');
  assert.ok(fs.existsSync(file), 'lint baseline 快照必须存在');
  const baseline = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(typeof baseline === 'object' && baseline !== null, 'baseline 必须是对象');
  assert.ok(Number.isInteger(baseline.total) && baseline.total > 0, 'baseline.total 必须为正整数');
});

test('lint 脚本存在且按新代码范围执行', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.lint, /eslint/, 'lint 脚本必须调用 eslint');
  assert.match(pkg.scripts['lint:all'], /eslint/, 'lint:all 脚本必须调用 eslint（全仓）');
  assert.match(pkg.scripts['lint:baseline'], /lint-baseline/, 'lint:baseline 脚本必须调用 baseline 工具');
});
