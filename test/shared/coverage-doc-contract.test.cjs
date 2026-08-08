/**
 * Coverage 基线文档合同（三轮）：
 * 文档必须包含全部 9 个 coverage workspace 名称与强制阈值列。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const PACKAGES = ['config', 'domain-core', 'contracts', 'test-kit', 'design-tokens', 'ui', 'subject-kit', 'math-expr', 'subject-settings'];

test('coverage-baseline.md 覆盖全部 9 个 workspace', () => {
  const doc = fs.readFileSync(path.join(root, 'docs/engineering/coverage-baseline.md'), 'utf8');
  for (const name of PACKAGES) {
    assert.match(doc, new RegExp(`\\|\\s*${name}\\s+\\|`), `文档必须含 ${name} 行`);
  }
  assert.match(doc, /强制阈值/, '文档有强制阈值列');
  assert.match(doc, /观察指标/, '文档区分强制/观察指标');
});
