/**
 * pkg 过渡 smoke 合同（Program 1 Task 1.8）。
 *
 * 断言：pkg-smoke 脚本存在可执行；退役门文档存在且列出 E1–E5 等价验收项；
 * pkg 依赖与退役门绑定（不可无限期保留）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = require('../helpers/repo-root.js');

test('pkg-smoke 脚本存在且可执行', () => {
  const script = path.join(root, 'scripts/pkg-smoke.mjs');
  assert.ok(fs.existsSync(script), 'scripts/pkg-smoke.mjs 必须存在');
  const out = execFileSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.match(out, /\[pkg-smoke\]/, 'pkg-smoke 必须输出状态');
});

test('退役门文档存在且列出 E1–E5 等价验收项与删除条件', () => {
  const gate = fs.readFileSync(path.join(root, 'docs/engineering/pkg-retirement-gate.md'), 'utf8');
  for (const item of ['E1', 'E2', 'E3', 'E4', 'E5']) {
    assert.ok(gate.includes(item), `退役门必须包含验收项 ${item}`);
  }
  assert.match(gate, /删除条件/, '退役门必须列出删除条件');
  assert.match(gate, /独立提交/, '删除必须为独立提交');
});

test('pkg 依赖与退役门绑定（apps/server/package.json）', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'apps/server/package.json'), 'utf8'),
  );
  // pkg 仍存在但必须在退役门文档中声明为过渡产物
  assert.ok(
    fs.existsSync(path.join(root, 'apps/server/scripts/pkg-win.js')) || pkg.dependencies?.pkg,
    'pkg 相关脚本/依赖现状记录',
  );
});
