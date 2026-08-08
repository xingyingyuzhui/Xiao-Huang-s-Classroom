/**
 * Coverage 阈值有效合同（R5）：
 * 故意设置不可达阈值时 coverage 必须 exit 1（阈值不是文档摆设）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = require('../helpers/repo-root.js');

const cfgPath = path.join(root, 'packages/contracts/vitest.config.ts');

test('不可达阈值导致 coverage exit 1；恢复后通过', () => {
  const original = fs.readFileSync(cfgPath, 'utf8');
  // 把 statements 阈值设为 101（不可达）
  const unreachable = original.replace(/statements: \d+/, 'statements: 101');
  fs.writeFileSync(cfgPath, unreachable);
  try {
    let failed = false;
    try {
      execFileSync('npm', ['run', 'coverage', '-w', '@xiaohuang/contracts'], {
        cwd: root,
        stdio: 'pipe',
        encoding: 'utf8',
      });
    } catch (err) {
      failed = true;
      const out = String(err.stdout || '') + String(err.stderr || '');
      assert.match(out, /threshold|ERROR|does not meet/, '失败信息含阈值说明');
    }
    assert.equal(failed, true, '不可达阈值必须导致 exit 1');
  } finally {
    fs.writeFileSync(cfgPath, original);
  }
  // 恢复后通过
  const out = execFileSync('npm', ['run', 'coverage', '-w', '@xiaohuang/contracts'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.doesNotMatch(out, /ERROR/i, '恢复后 coverage 通过');
});

test('coverage 配置只统计 src（排除 dist/coverage/test）', () => {
  const cfg = fs.readFileSync(cfgPath, 'utf8');
  assert.match(cfg, /include: \['src\/\*\*'\]/, '只统计 src');
  assert.match(cfg, /dist\/\*\*/, '排除 dist');
  assert.match(cfg, /coverage\/\*\*/, '排除 coverage');
  assert.match(cfg, /test\/\*\*/, '排除 test');
});
