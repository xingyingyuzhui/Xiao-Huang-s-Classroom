/**
 * JSXGraph eval 使用面守门（D-jessie / ADR-0003）。
 *
 * 断言：生产代码不调用 JessieCode 求值入口（JXG.evaluate / board.jc /
 * JXG.JessieCode），渲染路径不把表达式字符串交给 JSXGraph 解析——
 * eval 风险面锁定在第三方包内部。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

function collectJsFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'public') continue;
    if (e.isDirectory()) collectJsFiles(full, acc);
    else if (e.name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

test('生产代码无 JessieCode 求值入口调用（JXG.evaluate / board.jc）', () => {
  const files = collectJsFiles(path.join(root, 'apps/web/src'));
  const violations = [];
  // JXG.evaluate / evaluate( 绑定在 board 上的求值 / jc() 入口
  const pattern = /JXG\.evaluate|\.evaluate\s*\(|\.jc\s*\(|JessieCode/;
  for (const full of files) {
    const src = fs.readFileSync(full, 'utf8');
    const line = src.split('\n').find((l) => pattern.test(l) && !/^\s*\/\//.test(l.trim()));
    if (line) violations.push(`${path.relative(root, full)}: ${line.trim()}`);
  }
  assert.deepEqual(violations, [], '禁止调用 JSXGraph 表达式求值入口（ADR-0003）');
});

test('ADR-0003 文档存在且状态为已接受', () => {
  const doc = fs.readFileSync(path.join(root, 'docs/adr/0003-jsxgraph-eval.md'), 'utf8');
  assert.match(doc, /已接受/);
  assert.match(doc, /eval/);
});
