/**
 * 架构门禁合同（Program 1 Task 1.6）。
 *
 * 断言：依赖方向扫描脚本与规则存在；对当前仓库通过（0 违规）；
 * draw-tools.js 无 export *；lint:arch 脚本已接线。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = require('../helpers/repo-root.js');

test('架构门禁脚本与规则就位，对当前仓库通过', () => {
  const script = path.join(root, 'tooling/architecture/check-dependencies.mjs');
  assert.ok(fs.existsSync(script), 'check-dependencies.mjs 必须存在');
  assert.ok(fs.existsSync(path.join(root, 'tooling/architecture/rules.json')), 'rules.json 必须存在');
  // 脚本执行无违规
  const out = execFileSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.match(out, /OK/, '架构检查必须通过');
});

test('rules.json 覆盖关键依赖方向（packages→apps 反向、server→web、math↔chemistry）', () => {
  const rules = JSON.parse(
    fs.readFileSync(path.join(root, 'tooling/architecture/rules.json'), 'utf8'),
  );
  const froms = rules.forbidden.map((r) => r.from);
  for (const expect of ['packages/', 'apps/server/', 'apps/web/src/math/', 'apps/web/src/chemistry/']) {
    assert.ok(froms.includes(expect), `rules 必须覆盖 from: ${expect}`);
  }
});

test('draw-tools.js 无 export *（结构合同保持）', () => {
  const src = fs.readFileSync(path.join(root, 'apps/web/src/math/graph/draw-tools.js'), 'utf8');
  assert.equal(/export\s+\*(?!\s*as\b)/.test(src), false, 'draw-tools.js 不得有裸 export *');
});

test('lint:arch 脚本已接线', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['lint:arch'], /check-dependencies/, 'lint:arch 必须调用架构检查脚本');
});
