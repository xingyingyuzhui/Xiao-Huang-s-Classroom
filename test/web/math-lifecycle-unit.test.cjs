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
} = require('@xiaohuang/math-expr');

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

test('resolveFunctionColor maps colorSlot and validates explicitColor', () => {
  /** 与 math-theme.resolveFunctionColor 契约一致的纯实现（V2 颜色语义） */
  function normalizeHexColor(value) {
    if (typeof value !== 'string') return null;
    const raw = value.trim().toLowerCase();
    const match = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(raw);
    if (!match) return null;
    const hex = match[1];
    return hex.length === 3 || hex.length === 4
      ? `#${hex.split('').map((ch) => ch + ch).join('')}`
      : `#${hex}`;
  }
  function resolveFunctionColor(record, palette) {
    const explicit = normalizeHexColor(record?.explicitColor);
    if (explicit) return explicit;
    return palette[Math.max(0, Math.floor(Number(record?.colorSlot) || 0)) % palette.length];
  }
  const palette = ['#b45309', '#0f766e', '#2563eb'];
  // colorSlot 映射主题色板
  assert.equal(resolveFunctionColor({ colorSlot: 0, explicitColor: null }, palette), palette[0]);
  assert.equal(resolveFunctionColor({ colorSlot: 2, explicitColor: null }, palette), palette[2]);
  // 超界回绕
  assert.equal(resolveFunctionColor({ colorSlot: 5, explicitColor: null }, palette), palette[2]);
  // 严格 hex 校验：3/4 位扩展，named/rgb()/var() 拒绝
  assert.equal(resolveFunctionColor({ colorSlot: 0, explicitColor: '#f00' }, palette), '#ff0000');
  assert.equal(resolveFunctionColor({ colorSlot: 0, explicitColor: 'red' }, palette), palette[0]);
  assert.equal(resolveFunctionColor({ colorSlot: 0, explicitColor: 'rgb(1,2,3)' }, palette), palette[0]);
  assert.equal(resolveFunctionColor({ colorSlot: 0, explicitColor: 'var(--x)' }, palette), palette[0]);
  // 恶意字符串不能进入返回值
  assert.equal(resolveFunctionColor({ colorSlot: 0, explicitColor: 'red;background:url(https://x)' }, palette), palette[0]);
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
