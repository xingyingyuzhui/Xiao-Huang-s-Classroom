/**
 * 根脚本与 Node 基线合同（Program 1 Task 1.1）。
 *
 * 断言：engines/.nvmrc 固定最低运行基线；根 quality/lint/format/typecheck/
 * test/build 脚本存在且语义一致；tooling/ 骨架目录就位。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('engines 与 .nvmrc 固定 Node 最低运行基线（>=20，Electron 33 内嵌基线）', () => {
  assert.ok(pkg.engines?.node, 'package.json#engines.node 必须存在');
  const range = String(pkg.engines.node);
  assert.match(range, /20/, `engines.node 覆盖 Node 20 基线: ${range}`);
  for (const file of ['.nvmrc', '.node-version']) {
    const content = fs.readFileSync(path.join(root, file), 'utf8').trim();
    assert.match(content, /^20/, `${file} 固定 Node 20 基线，实际: ${content}`);
  }
});

test('根标准脚本齐全且语义一致（quality/lint/format/typecheck/test/build）', () => {
  for (const name of ['quality', 'lint', 'format', 'typecheck', 'test', 'build']) {
    assert.equal(typeof pkg.scripts?.[name], 'string', `根 scripts.${name} 必须存在`);
  }
  // quality 必须汇总 test 与 build（工程基座最小语义），不允许空占位
  assert.match(pkg.scripts.quality, /test/, 'quality 必须包含 test');
  assert.match(pkg.scripts.quality, /build/, 'quality 必须包含 build');
});

test('tooling 骨架目录与 README 就位', () => {
  for (const dir of ['architecture', 'performance', 'release']) {
    const readme = path.join(root, 'tooling', dir, 'README.md');
    assert.ok(fs.existsSync(readme), `tooling/${dir}/README.md 必须存在`);
  }
});
