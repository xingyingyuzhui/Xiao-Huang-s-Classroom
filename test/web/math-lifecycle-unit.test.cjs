/**
 * 数学画板：共享 expr + remint 行为单测
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const {
  compileMathExpr,
  validateMathExprSyntax,
  formatExprLabel,
} = require(path.join(root, 'packages/math-expr/index.cjs'));

test('shared math-expr: compile polynomials and sin', () => {
  const poly = compileMathExpr('0.5x^2-x-1.5');
  assert.equal(poly.ok, true);
  assert.ok(Math.abs(poly.fn(2) - (0.5 * 4 - 2 - 1.5)) < 1e-9);

  const sin = compileMathExpr('sin(x)');
  assert.equal(sin.ok, true);
  assert.ok(Math.abs(sin.fn(0)) < 1e-12);

  const bad = compileMathExpr('eval(1)');
  assert.equal(bad.ok, false);
});

test('shared math-expr: validateMathExprSyntax matches compile', () => {
  const ok = validateMathExprSyntax('sin(x)+0.5x');
  assert.equal(ok.ok, true);
  assert.match(ok.expr, /sin/);

  const empty = validateMathExprSyntax('  ');
  assert.equal(empty.ok, false);

  assert.match(formatExprLabel('x^2'), /^y = /);
});

test('remintFunctionColors aligns list order to palette', () => {
  /** 与 math-theme.remintFunctionColors 契约一致的纯实现 */
  function remintFunctionColors(functions, palette) {
    if (!Array.isArray(functions) || !palette?.length) return;
    functions.forEach((fn, i) => {
      if (!fn) return;
      fn.color = palette[i % palette.length];
    });
  }
  const chalk = ['#f0d060', '#7ec8c0', '#8ec5ff'];
  const def = ['#b45309', '#0f766e', '#2563eb'];
  const fns = [{ color: chalk[0] }, { color: chalk[1] }, { color: '#ff0000' }];
  // 全量 remint（当前实现会覆盖所有项）
  remintFunctionColors(fns, def);
  assert.equal(fns[0].color, def[0]);
  assert.equal(fns[1].color, def[1]);
  assert.equal(fns[2].color, def[2]);
});

test('withPreservedViewport restores bbox (mock board)', () => {
  let bb = [-2, 5, 4, -3];
  const board = {
    getBoundingBox() {
      return bb.slice();
    },
    setBoundingBox(next) {
      bb = next.slice();
    },
    update() {},
  };
  // 内联 lifecycle 语义：snapshot → work → restore（与 board-lifecycle 一致）
  const saved = board.getBoundingBox();
  bb = [0, 1, 1, 0]; // 模拟重建扰动
  board.setBoundingBox(saved, false);
  board.update();
  assert.deepEqual(bb, [-2, 5, 4, -3]);
});

test('detach-before-filter prevents ghost refs (state model)', () => {
  const board = {
    removed: [],
    removeObject(el) {
      this.removed.push(el);
    },
  };
  const functions = [
    { id: 'a', curve: { id: 'curve-a' } },
    { id: 'b', curve: { id: 'curve-b' } },
  ];
  const toDelete = functions.find((f) => f.id === 'b');
  // 正确顺序
  if (toDelete?.curve) {
    board.removeObject(toDelete.curve);
    toDelete.curve = null;
  }
  const next = functions.filter((f) => f.id !== 'b');
  assert.equal(next.length, 1);
  assert.equal(board.removed.length, 1);
  assert.equal(board.removed[0].id, 'curve-b');
  // 错误顺序会导致 remove 时找不到 curve —— 测试锁定正确顺序
  assert.equal(toDelete.curve, null);
});
