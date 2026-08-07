/**
 * TypeScript 配置体系合同（Program 1 Task 1.2）。
 *
 * 断言：根 tsconfig 矩阵存在；strict 系五选项全部开启；
 * 没有任何 config 用 strict:false 或关掉关键选项覆盖。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const REQUIRED_STRICT_OPTIONS = [
  'strict',
  'noUncheckedIndexedAccess',
  'exactOptionalPropertyTypes',
  'noImplicitOverride',
  'useUnknownInCatchVariables',
  'noFallthroughCasesInSwitch',
];

const FORBIDDEN_OPTIONS = {
  strict: false,
  noUncheckedIndexedAccess: false,
  exactOptionalPropertyTypes: false,
  noImplicitOverride: false,
  useUnknownInCatchVariables: false,
  noFallthroughCasesInSwitch: false,
};

function readJson(rel) {
  const file = path.join(root, rel);
  assert.ok(fs.existsSync(file), `${rel} 必须存在`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('根 tsconfig 矩阵存在：base/web/node/electron', () => {
  for (const name of ['tsconfig.base.json', 'tsconfig.web.json', 'tsconfig.node.json', 'tsconfig.electron.json']) {
    assert.ok(fs.existsSync(path.join(root, name)), `${name} 必须存在`);
  }
  // node 侧严格基线含 DOM 无关；web 侧可含 DOM lib，但严格选项一致
  for (const name of ['tsconfig.base.json', 'tsconfig.web.json', 'tsconfig.node.json', 'tsconfig.electron.json']) {
    const cfg = readJson(name);
    for (const opt of REQUIRED_STRICT_OPTIONS) {
      assert.equal(cfg.compilerOptions?.[opt], true, `${name} 必须开启 ${opt}`);
    }
  }
});

test('没有任何 config 关闭严格选项（含 extends 链）', () => {
  const seen = new Set();
  const check = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) return;
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [opt, bad] of Object.entries(FORBIDDEN_OPTIONS)) {
      assert.notEqual(cfg.compilerOptions?.[opt], bad, `${rel} 不得把 ${opt} 设为 ${bad}`);
    }
    for (const ext of [].concat(cfg.extends || [])) {
      check(path.join(path.dirname(rel), String(ext)));
    }
  };
  for (const name of ['tsconfig.base.json', 'tsconfig.web.json', 'tsconfig.node.json', 'tsconfig.electron.json']) {
    check(name);
  }
});

test('tsconfig.node.json 不含 DOM lib（纯 Node 目标）', () => {
  const cfg = readJson('tsconfig.node.json');
  const lib = [].concat(cfg.compilerOptions?.lib || []);
  assert.ok(!lib.some((l) => String(l).includes('DOM')), 'node config 不得含 DOM lib');
});
