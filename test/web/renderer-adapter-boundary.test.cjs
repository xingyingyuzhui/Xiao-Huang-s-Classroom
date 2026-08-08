/**
 * 渲染器 adapter 边界守门（B7）。
 *
 * 断言：three 只允许在 4 个独立渲染器（分子 3D / 电子云 3D / 立体几何 /
 * 书架 3D——产品视觉）与 bookshelf 目录；jsxgraph 只允许在 jsx-board
 * 单点（graph 渲染经其间接）；控制器/纯逻辑层不得散落 import。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const WEB_SRC = path.join(root, 'apps/web/src');

function collectJsFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collectJsFiles(full, acc);
    else if (e.name.endsWith('.js') || e.name.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

test('three 只允许在四个渲染器与 bookshelf（无散落 import）', () => {
  const allowedPrefixes = [
    'chemistry/molecule/viewer3d.',
    'chemistry/electron/renderer.',
    'math/solid/index.',
    'subjects/bookshelf/',
  ];
  const violations = [];
  for (const full of collectJsFiles(WEB_SRC)) {
    const src = fs.readFileSync(full, 'utf8');
    if (!/from\s+['"]three['"]/.test(src)) continue;
    const rel = path.relative(WEB_SRC, full).split(path.sep).join('/');
    if (!allowedPrefixes.some((p) => rel.startsWith(p))) {
      violations.push(rel);
    }
  }
  assert.deepEqual(violations, [], 'three 只能由四个渲染器/bookshelf import');
});

test('jsxgraph 只允许在 jsx-board 单点（渲染经其间接）', () => {
  const violations = [];
  for (const full of collectJsFiles(WEB_SRC)) {
    const src = fs.readFileSync(full, 'utf8');
    if (!/from\s+['"]jsxgraph['"]/.test(src)) continue;
    const rel = path.relative(WEB_SRC, full).split(path.sep).join('/');
    if (rel !== 'math/shared/jsx-board.js') violations.push(rel);
  }
  assert.deepEqual(violations, [], 'jsxgraph 只能由 jsx-board import');
});
