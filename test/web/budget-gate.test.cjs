/**
 * Bundle 预算门禁（R3.2）：
 * - index chunk 命名统一后必须真实计入预算（模拟超限 index 必须 exit 1）。
 * - 达标产物通过。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = require('../helpers/repo-root.js');

const script = path.join(root, 'tooling/performance/budget.mjs');

test('模拟超限 index chunk 必须退出 1', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-fail-'));
  // index 预算 720kB：生成 3 个 index chunk 合计 > 720
  const big = Buffer.alloc(300 * 1024, 'a');
  for (const n of ['index-AAA.js', 'index-BBB.js', 'index-CCC.js']) {
    fs.writeFileSync(path.join(dir, n), big);
  }
  try {
    execFileSync(process.execPath, [script], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, ARCH_BUDGET_DIST: dir },
    });
    assert.fail('超限 index 必须被拒绝');
  } catch (err) {
    const out = String(err.stdout || '') + String(err.stderr || '');
    assert.match(out, /index.*预算|index.*budget/i, `输出应报告 index 超限: ${out.slice(0, 200)}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('达标产物通过（真实 dist）', () => {
  const dist = path.join(root, 'apps/web/dist/assets');
  if (!fs.existsSync(dist)) {
    // 未构建时跳过（build 门禁会先跑）
    return;
  }
  const out = execFileSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.match(out, /\[budget\] total:.*OK|total:.*<=\s*4200/, `预算通过: ${out.slice(0, 300)}`);
});
