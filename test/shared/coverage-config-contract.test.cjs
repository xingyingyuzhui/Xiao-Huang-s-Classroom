/**
 * Coverage 配置合同（二轮）：
 * 所有声明 coverage 脚本的 package 必须有 vitest.config.ts 且定义
 * coverage.include 与 coverage.thresholds（不允许有命令无阈值）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const PACKAGES = ['config', 'domain-core', 'contracts', 'test-kit', 'design-tokens', 'ui', 'subject-kit', 'math-expr', 'subject-settings'];

test('9 个 coverage workspace 全部有 vitest.config.ts + include + thresholds', () => {
  for (const name of PACKAGES) {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'packages', name, 'package.json'), 'utf8'),
    );
    assert.equal(typeof pkg.scripts?.coverage, 'string', `${name} 必须有 coverage 脚本`);
    const cfgPath = path.join(root, 'packages', name, 'vitest.config.ts');
    assert.ok(fs.existsSync(cfgPath), `${name} 必须有 vitest.config.ts`);
    const cfg = fs.readFileSync(cfgPath, 'utf8');
    assert.match(cfg, /include: \['src\/\*\*'\]/, `${name} coverage 只统计 src`);
    assert.match(cfg, /thresholds:/, `${name} 必须定义 thresholds`);
    assert.match(cfg, /dist\/\*\*/, `${name} 排除 dist`);
    assert.match(cfg, /coverage\/\*\*/, `${name} 排除 coverage`);
    // 阈值必须有约束力（不为 0）
    const thresholds = cfg.match(/statements: (\d+)/);
    assert.ok(thresholds && Number(thresholds[1]) > 0, `${name} 阈值必须 > 0`);
  }
});
